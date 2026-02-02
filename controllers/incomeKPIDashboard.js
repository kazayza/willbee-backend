const { sql } = require('../config/db');

// ═══════════════════════════════════════════════════════════════
// 📊 Dashboard API - كل البيانات في Request واحد
// ═══════════════════════════════════════════════════════════════

const getDashboard = async (req, res) => {
    const { fromDate, toDate, branchId, kindId, compareWith, groupBy } = req.query;

    // ─────────────────────────────────────────────────────────
    // 1️⃣ التحقق من صحة البيانات
    // ─────────────────────────────────────────────────────────
    if (!fromDate || !toDate) {
        return res.status(400).json({
            success: false,
            message: 'fromDate و toDate مطلوبين'
        });
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return res.status(400).json({
            success: false,
            message: 'التواريخ غير صالحة'
        });
    }

    // ─────────────────────────────────────────────────────────
    // 2️⃣ حساب الفترة السابقة للمقارنة
    // ─────────────────────────────────────────────────────────
    let prevFrom = null;
    let prevTo = null;

    if (compareWith) {
        const diff = to - from;

        if (compareWith === 'previousPeriod') {
            prevTo = new Date(from.getTime() - 1);
            prevFrom = new Date(prevTo.getTime() - diff);
        } else if (compareWith === 'lastYear') {
            prevFrom = new Date(from);
            prevFrom.setFullYear(prevFrom.getFullYear() - 1);
            prevTo = new Date(to);
            prevTo.setFullYear(prevTo.getFullYear() - 1);
        }
    }

    try {
        // ─────────────────────────────────────────────────────
        // 3️⃣ تنفيذ كل الاستعلامات معاً
        // ─────────────────────────────────────────────────────
        const queries = [
            getMainKPIs(fromDate, toDate, branchId, kindId),
            getChartData(fromDate, toDate, branchId, kindId, groupBy || 'daily'),
            getKindDistribution(fromDate, toDate, branchId),
            getBranchDistribution(fromDate, toDate, kindId),
            getInsights(fromDate, toDate, branchId, kindId)
        ];

        // إضافة استعلام الفترة السابقة لو موجود
        if (prevFrom && prevTo) {
            queries.push(getMainKPIs(prevFrom, prevTo, branchId, kindId));
        }

        const results = await Promise.all(queries);

        // ─────────────────────────────────────────────────────
        // 4️⃣ تجهيز البيانات
        // ─────────────────────────────────────────────────────
        const mainKPIs = results[0];
        const chartData = results[1];
        const kindDist = results[2];
        const branchDist = results[3];
        const insights = results[4];
        const prevKPIs = (prevFrom && prevTo) ? results[5] : null;

        // حساب المتوسط اليومي
        const activeDays = mainKPIs.activeDays || 1;
        const dailyAverage = mainKPIs.totalAmount / activeDays;

        // حساب نسب التغيير
        let changes = null;
        if (prevKPIs) {
            const prevActiveDays = prevKPIs.activeDays || 1;
            const prevDailyAverage = prevKPIs.totalAmount / prevActiveDays;

            changes = {
                totalAmount: calculateChange(mainKPIs.totalAmount, prevKPIs.totalAmount),
                totalTransactions: calculateChange(mainKPIs.totalTransactions, prevKPIs.totalTransactions),
                avgTransaction: calculateChange(mainKPIs.avgAmount, prevKPIs.avgAmount),
                dailyAverage: calculateChange(dailyAverage, prevDailyAverage)
            };
        }

        // ─────────────────────────────────────────────────────
        // 5️⃣ إرسال الرد
        // ─────────────────────────────────────────────────────
        res.status(200).json({
            success: true,
            data: {
                mainKPIs: {
                    totalAmount: mainKPIs.totalAmount || 0,
                    totalTransactions: mainKPIs.totalTransactions || 0,
                    avgTransaction: mainKPIs.avgAmount || 0,
                    dailyAverage: dailyAverage || 0,
                    maxTransaction: mainKPIs.maxAmount || 0,
                    minTransaction: mainKPIs.minAmount || 0,
                    uniqueChildren: mainKPIs.uniqueChildren || 0,
                    activeDays: mainKPIs.activeDays || 0,
                    changes: changes
                },
                chartData: chartData,
                distributions: {
                    byKind: kindDist,
                    byBranch: branchDist
                },
                summary: insights,
                period: {
                    from: fromDate,
                    to: toDate,
                    previousFrom: prevFrom,
                    previousTo: prevTo
                }
            }
        });

    } catch (err) {
        console.error('Error in getDashboard:', err);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في جلب البيانات',
            error: err.message
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// 🔧 دوال الاستعلامات
// ═══════════════════════════════════════════════════════════════

async function getMainKPIs(fromDate, toDate, branchId, kindId) {
    const request = new sql.Request();

    request.input('fromDate', sql.Date, fromDate);
    request.input('toDate', sql.Date, toDate);

    let query = `
        SELECT 
            COUNT(*) as totalTransactions,
            ISNULL(SUM(d.incomeAmount), 0) as totalAmount,
            ISNULL(AVG(d.incomeAmount), 0) as avgAmount,
            ISNULL(MAX(d.incomeAmount), 0) as maxAmount,
            ISNULL(MIN(d.incomeAmount), 0) as minAmount,
            COUNT(DISTINCT d.child_ID) as uniqueChildren,
            COUNT(DISTINCT CAST(i.incomeDate as DATE)) as activeDays
        FROM tbl_income i
        INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
        WHERE i.incomeDate >= @fromDate AND i.incomeDate <= @toDate
    `;

    if (branchId) {
        query += ` AND d.incomBranchtxt = @branchId`;
        request.input('branchId', sql.SmallInt, branchId);
    }

    if (kindId) {
        query += ` AND d.incomeKind = @kindId`;
        request.input('kindId', sql.SmallInt, kindId);
    }

    const result = await request.query(query);
    return result.recordset[0] || {};
}

async function getChartData(fromDate, toDate, branchId, kindId, groupBy) {
    const request = new sql.Request();

    request.input('fromDate', sql.Date, fromDate);
    request.input('toDate', sql.Date, toDate);

    let dateFormat, groupByClause, orderBy;

    switch (groupBy) {
        case 'weekly':
            dateFormat = 'DATEPART(WEEK, i.incomeDate)';
            groupByClause = 'DATEPART(WEEK, i.incomeDate), DATEPART(YEAR, i.incomeDate)';
            orderBy = 'year, period';
            break;
        case 'monthly':
            dateFormat = 'MONTH(i.incomeDate)';
            groupByClause = 'MONTH(i.incomeDate), YEAR(i.incomeDate)';
            orderBy = 'year, period';
            break;
        default:
            dateFormat = 'CAST(i.incomeDate as DATE)';
            groupByClause = 'CAST(i.incomeDate as DATE)';
            orderBy = 'period';
    }

    let query = `
        SELECT 
            ${dateFormat} as period,
            ${groupBy !== 'daily' ? 'YEAR(i.incomeDate) as year,' : ''}
            COUNT(*) as transactions,
            ISNULL(SUM(d.incomeAmount), 0) as amount
        FROM tbl_income i
        INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
        WHERE i.incomeDate >= @fromDate AND i.incomeDate <= @toDate
    `;

    if (branchId) {
        query += ` AND d.incomBranchtxt = @branchId`;
        request.input('branchId', sql.SmallInt, branchId);
    }

    if (kindId) {
        query += ` AND d.incomeKind = @kindId`;
        request.input('kindId', sql.SmallInt, kindId);
    }

    query += ` GROUP BY ${groupByClause} ORDER BY ${orderBy}`;

    const result = await request.query(query);
    return result.recordset || [];
}

async function getKindDistribution(fromDate, toDate, branchId) {
    const request = new sql.Request();

    request.input('fromDate', sql.Date, fromDate);
    request.input('toDate', sql.Date, toDate);

    let query = `
        SELECT 
            k.ID as kindId,
            k.incomeKind as kindName,
            COUNT(*) as transactions,
            ISNULL(SUM(d.incomeAmount), 0) as amount
        FROM tbl_income i
        INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
        LEFT JOIN tbl_incomeKind k ON d.incomeKind = k.ID
        WHERE i.incomeDate >= @fromDate AND i.incomeDate <= @toDate
    `;

    if (branchId) {
        query += ` AND d.incomBranchtxt = @branchId`;
        request.input('branchId', sql.SmallInt, branchId);
    }

    query += ` GROUP BY k.ID, k.incomeKind ORDER BY amount DESC`;

    const result = await request.query(query);
    const data = result.recordset || [];

    // حساب النسب المئوية
    const total = data.reduce((sum, item) => sum + item.amount, 0);
    return data.map(item => ({
        ...item,
        percentage: total > 0 ? (item.amount / total) * 100 : 0
    }));
}

async function getBranchDistribution(fromDate, toDate, kindId) {
    const request = new sql.Request();

    request.input('fromDate', sql.Date, fromDate);
    request.input('toDate', sql.Date, toDate);

    let query = `
        SELECT 
            b.IDbranch as branchId,
            b.branchName,
            COUNT(*) as transactions,
            ISNULL(SUM(d.incomeAmount), 0) as amount
        FROM tbl_income i
        INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
        LEFT JOIN tbl_Branch b ON d.incomBranchtxt = b.IDbranch
        WHERE i.incomeDate >= @fromDate AND i.incomeDate <= @toDate
    `;

    if (kindId) {
        query += ` AND d.incomeKind = @kindId`;
        request.input('kindId', sql.SmallInt, kindId);
    }

    query += ` GROUP BY b.IDbranch, b.branchName ORDER BY amount DESC`;

    const result = await request.query(query);
    const data = result.recordset || [];

    // حساب النسب المئوية
    const total = data.reduce((sum, item) => sum + item.amount, 0);
    return data.map(item => ({
        ...item,
        percentage: total > 0 ? (item.amount / total) * 100 : 0
    }));
}

async function getInsights(fromDate, toDate, branchId, kindId) {
    const request = new sql.Request();

    request.input('fromDate', sql.Date, fromDate);
    request.input('toDate', sql.Date, toDate);

    let whereClause = `WHERE i.incomeDate >= @fromDate AND i.incomeDate <= @toDate`;

    if (branchId) {
        whereClause += ` AND d.incomBranchtxt = @branchId`;
        request.input('branchId', sql.SmallInt, branchId);
    }

    if (kindId) {
        whereClause += ` AND d.incomeKind = @kindId`;
        request.input('kindId', sql.SmallInt, kindId);
    }

    const query = `
        WITH DailyTotals AS (
            SELECT 
                CAST(i.incomeDate as DATE) as day,
                DATENAME(WEEKDAY, i.incomeDate) as dayName,
                ISNULL(SUM(d.incomeAmount), 0) as amount
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            ${whereClause}
            GROUP BY CAST(i.incomeDate as DATE), DATENAME(WEEKDAY, i.incomeDate)
        )
        SELECT 
            (SELECT TOP 1 dayName FROM DailyTotals ORDER BY amount DESC) as bestDay,
            (SELECT TOP 1 amount FROM DailyTotals ORDER BY amount DESC) as bestDayAmount,
            (SELECT TOP 1 dayName FROM DailyTotals ORDER BY amount ASC) as worstDay,
            (SELECT TOP 1 amount FROM DailyTotals ORDER BY amount ASC) as worstDayAmount
    `;

    const result = await request.query(query);
    return result.recordset[0] || {};
}

// ═══════════════════════════════════════════════════════════════
// 🔧 دالة حساب نسبة التغيير
// ═══════════════════════════════════════════════════════════════

function calculateChange(current, previous) {
    if (!previous || previous === 0) {
        return current > 0 ? 100 : 0;
    }
    return ((current - previous) / previous) * 100;
}

// ═══════════════════════════════════════════════════════════════
// تصدير
// ═══════════════════════════════════════════════════════════════

module.exports = {
    getDashboard
};