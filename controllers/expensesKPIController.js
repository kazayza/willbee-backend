const { sql } = require('../config/db');

// دالة حساب التواريخ (زي ما هي)
const calculateComparisonDates = (periodType, customStart, customEnd) => {
    const now = new Date();
    let currentStart, currentEnd, prevStart, prevEnd;

    if (periodType === 'custom' && customStart && customEnd) {
        currentStart = new Date(customStart);
        currentEnd = new Date(customEnd);
        const duration = currentEnd - currentStart;
        prevEnd = new Date(currentStart.getTime() - (24 * 60 * 60 * 1000));
        prevStart = new Date(prevEnd.getTime() - duration);
    } else if (periodType === 'quarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        currentStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
        currentEnd = now;
        prevStart = new Date(currentStart);
        prevStart.setMonth(prevStart.getMonth() - 3);
        prevEnd = new Date(prevStart);
        prevEnd.setMonth(prevEnd.getMonth() + 3);
        prevEnd.setDate(prevEnd.getDate() - 1);
    } else if (periodType === 'year') {
        currentStart = new Date(now.getFullYear(), 0, 1);
        currentEnd = now;
        prevStart = new Date(now.getFullYear() - 1, 0, 1);
        prevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    } else {
        // الافتراضي (شهر)
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentEnd = now;
        prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }
    return { currentStart, currentEnd, prevStart, prevEnd };
};

const getExpensesKPI = async (req, res) => {
    const { periodType, startDate, endDate, branchId, groupId, kindId } = req.query;

    try {
        // 1. حساب الفترات
        const dates = calculateComparisonDates(periodType, startDate, endDate);
        const request = new sql.Request();
        
        request.input('currStart', sql.Date, dates.currentStart);
        request.input('currEnd', sql.Date, dates.currentEnd);
        request.input('prevStart', sql.Date, dates.prevStart);
        request.input('prevEnd', sql.Date, dates.prevEnd);

        // 2. بناء الفلاتر الديناميكية
        let baseFilters = " AND e.Kind = 'اخرى' AND d.expenseKind <> 8"; // الفلتر الأساسي الثابت
        
        if (branchId) {
            baseFilters += " AND d.expenseBranchtxt = @branchId";
            request.input('branchId', sql.Int, branchId);
        }
        if (groupId) {
            baseFilters += " AND k.KindGroup = @groupId";
            request.input('groupId', sql.NVarChar, groupId);
        }
        if (kindId) {
            baseFilters += " AND d.expenseKind = @kindId";
            request.input('kindId', sql.Int, kindId);
        }

        // 3. الاستعلامات (Queries)

        // أ. استعلام المجموعات (Groups)
        const groupsQuery = `
            SELECT 
                k.KindGroup,
                SUM(CASE WHEN e.expenseDate BETWEEN @currStart AND @currEnd THEN d.expenseAmount ELSE 0 END) as GroupCurrent,
                SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END) as GroupPrevious
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            WHERE (e.expenseDate BETWEEN @prevStart AND @currEnd) 
            ${baseFilters}
            GROUP BY k.KindGroup
        `;

        // ب. استعلام الفروع (Branches)
        const branchesQuery = `
            SELECT 
                b.branchName,
                SUM(CASE WHEN e.expenseDate BETWEEN @currStart AND @currEnd THEN d.expenseAmount ELSE 0 END) as BranchCurrent,
                SUM(CASE WHEN e.expenseDate BETWEEN @prevStart AND @prevEnd THEN d.expenseAmount ELSE 0 END) as BranchPrevious
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_Branch b ON d.expenseBranchtxt = b.IDbranch
            WHERE (e.expenseDate BETWEEN @prevStart AND @currEnd) 
            ${baseFilters}
            GROUP BY b.branchName
            ORDER BY BranchCurrent DESC
        `;

        // ج. استعلام التريند اليومي (Daily Trend)
        const dailyQuery = `
            SELECT 
                FORMAT(e.expenseDate, 'yyyy-MM-dd') as Day, 
                SUM(d.expenseAmount) as Amount
            FROM tbl_expenses e
            JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID -- عشان الفلترة بالمجموعة
            WHERE e.expenseDate BETWEEN @currStart AND @currEnd 
            ${baseFilters}
            GROUP BY FORMAT(e.expenseDate, 'yyyy-MM-dd')
            ORDER BY Day ASC
        `;

        // تنفيذ الاستعلامات بالتوازي (أسرع بكتير)
        const [groupsResult, branchesResult, dailyResult] = await Promise.all([
            request.query(groupsQuery),
            request.query(branchesQuery),
            request.query(dailyQuery)
        ]);

        // 4. معالجة البيانات (Processing)
        let totalCurrent = 0;
        let totalPrevious = 0;
        let groupsData = [];
        let branchesData = [];
        let insights = [];

        // معالجة المجموعات
        groupsResult.recordset.forEach(row => {
            totalCurrent += row.GroupCurrent || 0;
            totalPrevious += row.GroupPrevious || 0;
            
            if (row.GroupCurrent > 0 || row.GroupPrevious > 0) {
                groupsData.push({
                    group: row.KindGroup || 'أخرى',
                    current: row.GroupCurrent,
                    previous: row.GroupPrevious
                });

                // كشف القفزات (Insights)
                if (row.GroupPrevious > 0) {
                    const jump = ((row.GroupCurrent - row.GroupPrevious) / row.GroupPrevious) * 100;
                    if (jump > 50) {
                        insights.push(`🔥 قفزة في "${row.KindGroup}": +${jump.toFixed(0)}%!`);
                    }
                }
            }
        });

        // معالجة الفروع
        branchesResult.recordset.forEach(row => {
            if (row.BranchCurrent > 0 || row.BranchPrevious > 0) {
                branchesData.push({
                    name: row.branchName || 'غير محدد',
                    current: row.BranchCurrent,
                    previous: row.BranchPrevious
                });
            }
        });

        // الإحصائيات العامة
        const diff = totalCurrent - totalPrevious;
        const percent = totalPrevious > 0 ? ((diff / totalPrevious) * 100).toFixed(1) : 100;

        if (diff > 0) insights.push(`⚠️ زيادة عامة: ${percent}%`);
        else if (diff < 0) insights.push(`✅ توفير عام: ${Math.abs(diff)} ج.م`);
        
        if (branchesData.length > 0) {
            insights.push(`🏢 الأكثر إنفاقاً: ${branchesData[0].name}`);
        }

        // 5. إرسال الرد (Response)
        res.status(200).json({
            dates: {
                current: { start: dates.currentStart, end: dates.currentEnd },
                previous: { start: dates.prevStart, end: dates.prevEnd }
            },
            summary: {
                totalCurrent,
                totalPrevious,
                diff,
                percent: parseFloat(percent)
            },
            groupsData,
            branchesData,
            dailyTrend: dailyResult.recordset,
            insights
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getExpensesKPI };