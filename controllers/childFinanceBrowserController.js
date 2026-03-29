const { sql } = require('../config/db');

// =====================================================
// 🔤 تطبيع البحث العربي داخل Node.js
// =====================================================
const normalizeArabic = (text = '') => {
    return text
        .toString()
        .trim()
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[ًٌٍَُِّْـ]/g, '')
        .replace(/\s+/g, ' ');
};

// =====================================================
// 📌 helper: تحويل نوع الاشتراك لقيم الجدول
// =====================================================
const getSubscriptionKindFilter = (kind) => {
    if (!kind || kind === 'all') return null;

    if (kind === 'study') return 'اشتراك الدراسة السنوى';
    if (kind === 'bus') return 'اشتراك الباص';

    return null;
};

// =====================================================
// 1) نظرة عامة على الأعوام المالية
// GET /api/child-finance-browser/sessions-overview
// =====================================================
const getSessionsOverview = async (req, res) => {
    try {
        const query = `
            SELECT 
                s.IDSession AS sessionId,
                s.Sessions AS sessionName,

                COUNT(fc.ID) AS totalRecords,

                COUNT(DISTINCT fc.Child_Id) AS uniqueChildrenCount,

                COUNT(DISTINCT CASE WHEN ISNULL(fc.withdraw, 0) = 0 THEN fc.Child_Id END) AS activeChildrenCount,
                COUNT(DISTINCT CASE WHEN ISNULL(fc.withdraw, 0) = 1 THEN fc.Child_Id END) AS withdrawnChildrenCount,

                COUNT(CASE WHEN fc.Kind_subscrip = N'اشتراك الدراسة السنوى' THEN 1 END) AS studyCount,
                COUNT(CASE WHEN fc.Kind_subscrip = N'اشتراك الباص' THEN 1 END) AS busCount,

                ISNULL(SUM(CASE WHEN fc.Kind_subscrip = N'اشتراك الدراسة السنوى' THEN ISNULL(fc.amount_Sub, 0) ELSE 0 END), 0) AS studyTotal,
                ISNULL(SUM(CASE WHEN fc.Kind_subscrip = N'اشتراك الباص' THEN ISNULL(fc.amount_Sub, 0) ELSE 0 END), 0) AS busTotal,

                MIN(fc.SubDate) AS firstSubDate,
                MAX(fc.SubDate) AS lastSubDate

            FROM tbl_Sessions s
            LEFT JOIN tbl_FinanceChild fc ON s.IDSession = fc.SessionID
            GROUP BY s.IDSession, s.Sessions
            ORDER BY s.IDSession DESC
        `;

        const result = await sql.query(query);

        res.status(200).json({
            success: true,
            data: result.recordset
        });
    } catch (err) {
        console.error('❌ getSessionsOverview Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// =====================================================
// 2) Dashboard العام المالي
// GET /api/child-finance-browser/session-dashboard/:sessionId
// =====================================================
const getSessionDashboard = async (req, res) => {
    try {
        const { sessionId } = req.params;

        if (!sessionId || isNaN(sessionId)) {
            return res.status(400).json({ error: 'sessionId غير صحيح' });
        }

        // -----------------------------
        // بيانات العام المالي
        // -----------------------------
        const sessionRequest = new sql.Request();
        sessionRequest.input('sessionId', sql.Int, parseInt(sessionId));

        const sessionResult = await sessionRequest.query(`
            SELECT IDSession AS sessionId, Sessions AS sessionName
            FROM tbl_Sessions
            WHERE IDSession = @sessionId
        `);

        if (sessionResult.recordset.length === 0) {
            return res.status(404).json({ error: 'العام المالي غير موجود' });
        }

        const session = sessionResult.recordset[0];

        // -----------------------------
        // الملخص العام
        // -----------------------------
        const summaryRequest = new sql.Request();
        summaryRequest.input('sessionId', sql.Int, parseInt(sessionId));

        const summaryResult = await summaryRequest.query(`
            SELECT
                COUNT(DISTINCT fc.Child_Id) AS uniqueChildrenCount,
                ISNULL(SUM(ISNULL(fc.amount_Sub, 0)), 0) AS totalAmount,
                ISNULL(AVG(CAST(ISNULL(fc.amount_Sub, 0) AS DECIMAL(18,2))), 0) AS averageAmount,
                ISNULL(MIN(ISNULL(fc.amount_Sub, 0)), 0) AS minAmount,
                ISNULL(MAX(ISNULL(fc.amount_Sub, 0)), 0) AS maxAmount,
                MIN(fc.SubDate) AS firstSubDate,
                MAX(fc.SubDate) AS lastSubDate
            FROM tbl_FinanceChild fc
            WHERE fc.SessionID = @sessionId
        `);

        const summary = summaryResult.recordset[0];

        // -----------------------------
        // الفروع
        // -----------------------------
        const branchesRequest = new sql.Request();
        branchesRequest.input('sessionId', sql.Int, parseInt(sessionId));

        const branchesResult = await branchesRequest.query(`
            SELECT 
                b.IDbranch AS branchId,
                b.branchName,
                COUNT(DISTINCT fc.Child_Id) AS [count]
            FROM tbl_FinanceChild fc
            INNER JOIN tbl_Child c ON fc.Child_Id = c.ID_Child
            INNER JOIN tbl_Branch b ON c.Branch = b.IDbranch
            WHERE fc.SessionID = @sessionId
            GROUP BY b.IDbranch, b.branchName
            ORDER BY b.IDbranch
        `);

        const branches = [
            {
                branchId: 'all',
                branchName: 'الكل',
                count: summary.uniqueChildrenCount || 0
            },
            ...branchesResult.recordset
        ];

        // -----------------------------
        // الحالات
        // -----------------------------
        const statusRequest = new sql.Request();
        statusRequest.input('sessionId', sql.Int, parseInt(sessionId));

        const statusResult = await statusRequest.query(`
            SELECT 
                COUNT(DISTINCT CASE WHEN ISNULL(fc.withdraw, 0) = 0 THEN fc.Child_Id END) AS activeCount,
                COUNT(DISTINCT CASE WHEN ISNULL(fc.withdraw, 0) = 1 THEN fc.Child_Id END) AS withdrawnCount
            FROM tbl_FinanceChild fc
            WHERE fc.SessionID = @sessionId
        `);

        const statusesRaw = statusResult.recordset[0];

        const statuses = [
            {
                key: 'active',
                label: 'النشطون',
                count: statusesRaw.activeCount || 0
            },
            {
                key: 'withdrawn',
                label: 'المنسحبون',
                count: statusesRaw.withdrawnCount || 0
            }
        ];

        // -----------------------------
        // أنواع الاشتراك
        // -----------------------------
        const kindsRequest = new sql.Request();
        kindsRequest.input('sessionId', sql.Int, parseInt(sessionId));

        const kindsResult = await kindsRequest.query(`
            SELECT
                COUNT(*) AS allCount,
                COUNT(CASE WHEN fc.Kind_subscrip = N'اشتراك الدراسة السنوى' THEN 1 END) AS studyCount,
                COUNT(CASE WHEN fc.Kind_subscrip = N'اشتراك الباص' THEN 1 END) AS busCount
            FROM tbl_FinanceChild fc
            WHERE fc.SessionID = @sessionId
        `);

        const kindsRaw = kindsResult.recordset[0];

        const subscriptionKinds = [
            {
                key: 'all',
                label: 'الكل',
                count: kindsRaw.allCount || 0
            },
            {
                key: 'study',
                label: 'اشتراك الدراسة السنوى',
                count: kindsRaw.studyCount || 0
            },
            {
                key: 'bus',
                label: 'اشتراك الباص',
                count: kindsRaw.busCount || 0
            }
        ];

        res.status(200).json({
            success: true,
            session,
            summary,
            branches,
            statuses,
            subscriptionKinds
        });
    } catch (err) {
        console.error('❌ getSessionDashboard Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// =====================================================
// 3) سجلات العام المالي مع الفلاتر والبحث
// GET /api/child-finance-browser/session-records/:sessionId
// =====================================================
const getSessionRecords = async (req, res) => {
    try {
        const { sessionId } = req.params;
        let {
            branchId = 'all',
            status = 'active',   // active | withdrawn | all
            kind = 'all',        // all | study | bus
            search = '',
            viewMode = 'list',   // list | month
            sortBy = 'subDate',  // subDate | name | amount
            sortOrder = 'desc',  // asc | desc
            page = 1,
            pageSize = 20
        } = req.query;

        if (!sessionId || isNaN(sessionId)) {
            return res.status(400).json({ error: 'sessionId غير صحيح' });
        }

        page = parseInt(page);
        pageSize = parseInt(pageSize);

        if (isNaN(page) || page < 1) page = 1;
        if (isNaN(pageSize) || pageSize < 1) pageSize = 20;
        if (pageSize > 200) pageSize = 200;

        if (!['active', 'withdrawn', 'all'].includes(status)) status = 'active';
        if (!['all', 'study', 'bus'].includes(kind)) kind = 'all';
        if (!['list', 'month'].includes(viewMode)) viewMode = 'list';
        if (!['subDate', 'name', 'amount'].includes(sortBy)) sortBy = 'subDate';
        if (!['asc', 'desc'].includes(sortOrder.toLowerCase())) sortOrder = 'desc';

        const normalizedSearch = normalizeArabic(search);

        // ----------------------------------------
        // 1) جلب البيانات الأساسية كاملة ثم فلترة البحث الذكي في Node.js
        // ----------------------------------------
        let baseQuery = `
            SELECT
                fc.ID AS financeId,
                fc.Child_Id AS childId,
                c.FullNameArabic AS childName,
                c.Branch AS branchId,
                b.branchName,
                fc.Kind_subscrip AS subscriptionKind,
                ISNULL(fc.amount_Sub, 0) AS amountSub,
                ISNULL(fc.amountBase, 0) AS amountBase,
                ISNULL(fc.discount, 0) AS discount,
                ISNULL(fc.withdraw, 0) AS [withdraw],
                ISNULL(fc.withdrawamount, 0) AS withdrawAmount,
                fc.BusLine AS busLineId,
                bl.BusLine AS busLineName,
                fc.SubDate AS subDate
            FROM tbl_FinanceChild fc
            INNER JOIN tbl_Child c ON fc.Child_Id = c.ID_Child
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            LEFT JOIN tbl_BusLines bl ON fc.BusLine = bl.ID
            WHERE fc.SessionID = @sessionId
        `;

        if (branchId !== 'all' && !isNaN(branchId)) {
            baseQuery += ` AND c.Branch = @branchId`;
        }

        if (status === 'active') {
            baseQuery += ` AND ISNULL(fc.withdraw, 0) = 0`;
        } else if (status === 'withdrawn') {
            baseQuery += ` AND ISNULL(fc.withdraw, 0) = 1`;
        }

        const subscriptionKindValue = getSubscriptionKindFilter(kind);
        if (subscriptionKindValue) {
            baseQuery += ` AND fc.Kind_subscrip = @subscriptionKind`;
        }

        const request = new sql.Request();
        request.input('sessionId', sql.Int, parseInt(sessionId));

        if (branchId !== 'all' && !isNaN(branchId)) {
            request.input('branchId', sql.SmallInt, parseInt(branchId));
        }

        if (subscriptionKindValue) {
            request.input('subscriptionKind', sql.NVarChar(100), subscriptionKindValue);
        }

        const result = await request.query(baseQuery);
        let records = result.recordset || [];

        // ----------------------------------------
        // 2) البحث الذكي بالعربي
        // ----------------------------------------
        if (normalizedSearch) {
            records = records.filter(item => {
                const normalizedName = normalizeArabic(item.childName || '');
                return normalizedName.includes(normalizedSearch);
            });
        }

        // ----------------------------------------
        // 3) الترتيب
        // ----------------------------------------
        records.sort((a, b) => {
            let compareA;
            let compareB;

            switch (sortBy) {
                case 'name':
                    compareA = normalizeArabic(a.childName || '');
                    compareB = normalizeArabic(b.childName || '');
                    break;
                case 'amount':
                    compareA = parseFloat(a.amountSub || 0);
                    compareB = parseFloat(b.amountSub || 0);
                    break;
                case 'subDate':
                default:
                    compareA = a.subDate ? new Date(a.subDate).getTime() : 0;
                    compareB = b.subDate ? new Date(b.subDate).getTime() : 0;
                    break;
            }

            if (compareA < compareB) return sortOrder === 'asc' ? -1 : 1;
            if (compareA > compareB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        // ----------------------------------------
        // 4) summary
        // ----------------------------------------
        const totalAmount = records.reduce((sum, item) => sum + parseFloat(item.amountSub || 0), 0);
        const amounts = records.map(item => parseFloat(item.amountSub || 0));

        const summary = {
            recordsCount: records.length,
            uniqueChildrenCount: new Set(records.map(r => r.childId)).size,
            totalAmount,
            averageAmount: records.length > 0 ? totalAmount / records.length : 0,
            minAmount: amounts.length > 0 ? Math.min(...amounts) : 0,
            maxAmount: amounts.length > 0 ? Math.max(...amounts) : 0
        };

        // ----------------------------------------
        // 5) وضع العرض list
        // ----------------------------------------
        if (viewMode === 'list' || normalizedSearch) {
            const totalRecords = records.length;
            const totalPages = Math.ceil(totalRecords / pageSize);
            const startIndex = (page - 1) * pageSize;
            const pagedRecords = records.slice(startIndex, startIndex + pageSize);

            return res.status(200).json({
                success: true,
                session: {
                    sessionId: parseInt(sessionId)
                },
                filters: {
                    branchId,
                    status,
                    kind,
                    search,
                    viewMode: 'list',
                    sortBy,
                    sortOrder,
                    page,
                    pageSize
                },
                summary,
                records: pagedRecords,
                pagination: {
                    page,
                    pageSize,
                    totalRecords,
                    totalPages
                }
            });
        }

        // ----------------------------------------
        // 6) وضع العرض حسب الشهر
        // ----------------------------------------
        const groupedMap = {};

        records.forEach(item => {
            let monthKey = 'بدون-تاريخ';
            let monthLabel = 'بدون تاريخ';

            if (item.subDate) {
                const d = new Date(item.subDate);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');

                monthKey = `${year}-${month}`;

                const monthNames = [
                    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
                    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
                ];
                monthLabel = `${year}-${monthNames[d.getMonth()]}`;
            }

            if (!groupedMap[monthKey]) {
                groupedMap[monthKey] = {
                    monthKey,
                    monthLabel,
                    count: 0,
                    totalAmount: 0,
                    records: []
                };
            }

            groupedMap[monthKey].count += 1;
            groupedMap[monthKey].totalAmount += parseFloat(item.amountSub || 0);
            groupedMap[monthKey].records.push(item);
        });

        let groups = Object.values(groupedMap);

        groups.sort((a, b) => {
            if (a.monthKey === 'بدون-تاريخ') return 1;
            if (b.monthKey === 'بدون-تاريخ') return -1;

            if (a.monthKey < b.monthKey) return sortOrder === 'asc' ? -1 : 1;
            if (a.monthKey > b.monthKey) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return res.status(200).json({
            success: true,
            session: {
                sessionId: parseInt(sessionId)
            },
            filters: {
                branchId,
                status,
                kind,
                search,
                viewMode: 'month',
                sortBy,
                sortOrder
            },
            summary,
            groups
        });

    } catch (err) {
        console.error('❌ getSessionRecords Error:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getSessionsOverview,
    getSessionDashboard,
    getSessionRecords
};