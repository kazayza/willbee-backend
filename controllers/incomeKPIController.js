const { sql } = require('../config/db');

// ═══════════════════════════════════════════════════════════════
// 📊 مؤشرات أداء الإيرادات - Income KPI Controller
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// 1️⃣ البطاقات الرئيسية (KPIs)
// ═══════════════════════════════════════════════════════════════
const getMainKPIs = async (req, res) => {
    const { fromDate, toDate, branchId, kindId, compareWith } = req.query;

    try {
        const request = new sql.Request();

        // الفترة الحالية
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
            WHERE 1=1
        `;

        if (fromDate) {
            query += ` AND i.incomeDate >= @fromDate`;
            request.input('fromDate', sql.Date, fromDate);
        }
        if (toDate) {
            query += ` AND i.incomeDate <= @toDate`;
            request.input('toDate', sql.Date, toDate);
        }
        if (branchId) {
            query += ` AND d.incomBranchtxt = @branchId`;
            request.input('branchId', sql.SmallInt, branchId);
        }
        if (kindId) {
            query += ` AND d.incomeKind = @kindId`;
            request.input('kindId', sql.SmallInt, kindId);
        }

        const currentResult = await request.query(query);
        const current = currentResult.recordset[0];

        // حساب المتوسط اليومي
        const dailyAvg = current.activeDays > 0 
            ? current.totalAmount / current.activeDays 
            : 0;

        // الفترة السابقة للمقارنة
        let previousData = null;
        if (compareWith && fromDate && toDate) {
            const from = new Date(fromDate);
            const to = new Date(toDate);
            const diff = to - from;

            let prevFrom, prevTo;
            
            if (compareWith === 'previousPeriod') {
                prevTo = new Date(from.getTime() - 1);
                prevFrom = new Date(prevTo.getTime() - diff);
            } else if (compareWith === 'lastYear') {
                prevFrom = new Date(from);
                prevFrom.setFullYear(prevFrom.getFullYear() - 1);
                prevTo = new Date(to);
                prevTo.setFullYear(prevTo.getFullYear() - 1);
            }

            if (prevFrom && prevTo) {
                const prevRequest = new sql.Request();
                let prevQuery = `
                    SELECT 
                        COUNT(*) as totalTransactions,
                        ISNULL(SUM(d.incomeAmount), 0) as totalAmount,
                        ISNULL(AVG(d.incomeAmount), 0) as avgAmount,
                        COUNT(DISTINCT CAST(i.incomeDate as DATE)) as activeDays
                    FROM tbl_income i
                    INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
                    WHERE i.incomeDate >= @prevFrom AND i.incomeDate <= @prevTo
                `;

                prevRequest.input('prevFrom', sql.Date, prevFrom);
                prevRequest.input('prevTo', sql.Date, prevTo);

                if (branchId) {
                    prevQuery += ` AND d.incomBranchtxt = @branchId`;
                    prevRequest.input('branchId', sql.SmallInt, branchId);
                }
                if (kindId) {
                    prevQuery += ` AND d.incomeKind = @kindId`;
                    prevRequest.input('kindId', sql.SmallInt, kindId);
                }

                const prevResult = await prevRequest.query(prevQuery);
                previousData = prevResult.recordset[0];
            }
        }

        // حساب نسب التغيير
        const calculateChange = (current, previous) => {
            if (!previous || previous === 0) return null;
            return ((current - previous) / previous) * 100;
        };

        res.status(200).json({
            success: true,
            data: {
                totalAmount: current.totalAmount,
                totalTransactions: current.totalTransactions,
                avgTransaction: current.avgAmount,
                dailyAverage: dailyAvg,
                maxTransaction: current.maxAmount,
                minTransaction: current.minAmount,
                uniqueChildren: current.uniqueChildren,
                activeDays: current.activeDays,
                changes: previousData ? {
                    totalAmount: calculateChange(current.totalAmount, previousData.totalAmount),
                    totalTransactions: calculateChange(current.totalTransactions, previousData.totalTransactions),
                    avgTransaction: calculateChange(current.avgAmount, previousData.avgAmount),
                    dailyAverage: calculateChange(
                        dailyAvg, 
                        previousData.activeDays > 0 ? previousData.totalAmount / previousData.activeDays : 0
                    )
                } : null,
                previousPeriod: previousData
            }
        });

    } catch (err) {
        console.error('Error in getMainKPIs:', err);
        res.status(500).json({ success: false, message: 'خطأ في جلب المؤشرات', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 2️⃣ بيانات الرسم البياني (يومي/أسبوعي/شهري)
// ═══════════════════════════════════════════════════════════════
const getChartData = async (req, res) => {
    const { fromDate, toDate, branchId, kindId, groupBy, compareWith } = req.query;

    try {
        const request = new sql.Request();

        let dateFormat;
        let groupByClause;

        switch (groupBy) {
            case 'daily':
                dateFormat = 'CAST(i.incomeDate as DATE)';
                groupByClause = 'CAST(i.incomeDate as DATE)';
                break;
            case 'weekly':
                dateFormat = 'DATEPART(WEEK, i.incomeDate)';
                groupByClause = 'DATEPART(WEEK, i.incomeDate), DATEPART(YEAR, i.incomeDate)';
                break;
            case 'monthly':
                dateFormat = 'MONTH(i.incomeDate)';
                groupByClause = 'MONTH(i.incomeDate), YEAR(i.incomeDate)';
                break;
            default:
                dateFormat = 'CAST(i.incomeDate as DATE)';
                groupByClause = 'CAST(i.incomeDate as DATE)';
        }

        let query = `
            SELECT 
                ${dateFormat} as period,
                ${groupBy === 'weekly' ? 'DATEPART(YEAR, i.incomeDate) as year,' : ''}
                ${groupBy === 'monthly' ? 'YEAR(i.incomeDate) as year,' : ''}
                COUNT(*) as transactions,
                ISNULL(SUM(d.incomeAmount), 0) as amount
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            WHERE 1=1
        `;

        if (fromDate) {
            query += ` AND i.incomeDate >= @fromDate`;
            request.input('fromDate', sql.Date, fromDate);
        }
        if (toDate) {
            query += ` AND i.incomeDate <= @toDate`;
            request.input('toDate', sql.Date, toDate);
        }
        if (branchId) {
            query += ` AND d.incomBranchtxt = @branchId`;
            request.input('branchId', sql.SmallInt, branchId);
        }
        if (kindId) {
            query += ` AND d.incomeKind = @kindId`;
            request.input('kindId', sql.SmallInt, kindId);
        }

        query += ` GROUP BY ${groupByClause} ORDER BY ${groupBy === 'daily' ? 'period' : 'year, period'}`;

        const currentResult = await request.query(query);

        // بيانات الفترة السابقة للمقارنة
        let previousData = [];
        if (compareWith && fromDate && toDate) {
            const from = new Date(fromDate);
            const to = new Date(toDate);
            const diff = to - from;

            let prevFrom, prevTo;

            if (compareWith === 'previousPeriod') {
                prevTo = new Date(from.getTime() - 1);
                prevFrom = new Date(prevTo.getTime() - diff);
            } else if (compareWith === 'lastYear') {
                prevFrom = new Date(from);
                prevFrom.setFullYear(prevFrom.getFullYear() - 1);
                prevTo = new Date(to);
                prevTo.setFullYear(prevTo.getFullYear() - 1);
            }

            if (prevFrom && prevTo) {
                const prevRequest = new sql.Request();
                let prevQuery = `
                    SELECT 
                        ${dateFormat} as period,
                        ${groupBy === 'weekly' ? 'DATEPART(YEAR, i.incomeDate) as year,' : ''}
                        ${groupBy === 'monthly' ? 'YEAR(i.incomeDate) as year,' : ''}
                        COUNT(*) as transactions,
                        ISNULL(SUM(d.incomeAmount), 0) as amount
                    FROM tbl_income i
                    INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
                    WHERE i.incomeDate >= @prevFrom AND i.incomeDate <= @prevTo
                `;

                prevRequest.input('prevFrom', sql.Date, prevFrom);
                prevRequest.input('prevTo', sql.Date, prevTo);

                if (branchId) {
                    prevQuery += ` AND d.incomBranchtxt = @branchId`;
                    prevRequest.input('branchId', sql.SmallInt, branchId);
                }
                if (kindId) {
                    prevQuery += ` AND d.incomeKind = @kindId`;
                    prevRequest.input('kindId', sql.SmallInt, kindId);
                }

                prevQuery += ` GROUP BY ${groupByClause} ORDER BY ${groupBy === 'daily' ? 'period' : 'year, period'}`;

                const prevResult = await prevRequest.query(prevQuery);
                previousData = prevResult.recordset;
            }
        }

        res.status(200).json({
            success: true,
            data: {
                current: currentResult.recordset,
                previous: previousData
            }
        });

    } catch (err) {
        console.error('Error in getChartData:', err);
        res.status(500).json({ success: false, message: 'خطأ في جلب بيانات الرسم', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 3️⃣ التوزيع حسب النوع
// ═══════════════════════════════════════════════════════════════
const getDistributionByKind = async (req, res) => {
    const { fromDate, toDate, branchId, compareWith } = req.query;

    try {
        const request = new sql.Request();

        let query = `
            SELECT 
                k.ID as kindId,
                k.incomeKind as kindName,
                k.kindGroup,
                COUNT(*) as transactions,
                ISNULL(SUM(d.incomeAmount), 0) as amount
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            LEFT JOIN tbl_incomeKind k ON d.incomeKind = k.ID
            WHERE 1=1
        `;

        if (fromDate) {
            query += ` AND i.incomeDate >= @fromDate`;
            request.input('fromDate', sql.Date, fromDate);
        }
        if (toDate) {
            query += ` AND i.incomeDate <= @toDate`;
            request.input('toDate', sql.Date, toDate);
        }
        if (branchId) {
            query += ` AND d.incomBranchtxt = @branchId`;
            request.input('branchId', sql.SmallInt, branchId);
        }

        query += ` GROUP BY k.ID, k.incomeKind, k.kindGroup ORDER BY amount DESC`;

        const currentResult = await request.query(query);

        // حساب النسب المئوية
        const total = currentResult.recordset.reduce((sum, item) => sum + item.amount, 0);
        const dataWithPercentage = currentResult.recordset.map(item => ({
            ...item,
            percentage: total > 0 ? (item.amount / total) * 100 : 0
        }));

        // بيانات الفترة السابقة
        let previousData = [];
        if (compareWith && fromDate && toDate) {
            const from = new Date(fromDate);
            const to = new Date(toDate);
            const diff = to - from;

            let prevFrom, prevTo;

            if (compareWith === 'previousPeriod') {
                prevTo = new Date(from.getTime() - 1);
                prevFrom = new Date(prevTo.getTime() - diff);
            } else if (compareWith === 'lastYear') {
                prevFrom = new Date(from);
                prevFrom.setFullYear(prevFrom.getFullYear() - 1);
                prevTo = new Date(to);
                prevTo.setFullYear(prevTo.getFullYear() - 1);
            }

            if (prevFrom && prevTo) {
                const prevRequest = new sql.Request();
                let prevQuery = `
                    SELECT 
                        k.ID as kindId,
                        ISNULL(SUM(d.incomeAmount), 0) as amount
                    FROM tbl_income i
                    INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
                    LEFT JOIN tbl_incomeKind k ON d.incomeKind = k.ID
                    WHERE i.incomeDate >= @prevFrom AND i.incomeDate <= @prevTo
                `;

                prevRequest.input('prevFrom', sql.Date, prevFrom);
                prevRequest.input('prevTo', sql.Date, prevTo);

                if (branchId) {
                    prevQuery += ` AND d.incomBranchtxt = @branchId`;
                    prevRequest.input('branchId', sql.SmallInt, branchId);
                }

                prevQuery += ` GROUP BY k.ID`;

                const prevResult = await prevRequest.query(prevQuery);
                previousData = prevResult.recordset;
            }
        }

        // حساب نسب التغيير
        const dataWithChanges = dataWithPercentage.map(item => {
            const prevItem = previousData.find(p => p.kindId === item.kindId);
            const change = prevItem && prevItem.amount > 0 
                ? ((item.amount - prevItem.amount) / prevItem.amount) * 100 
                : null;
            return { ...item, change };
        });

        res.status(200).json({
            success: true,
            data: dataWithChanges,
            total: total
        });

    } catch (err) {
        console.error('Error in getDistributionByKind:', err);
        res.status(500).json({ success: false, message: 'خطأ في جلب التوزيع', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 4️⃣ التوزيع حسب الفرع
// ═══════════════════════════════════════════════════════════════
const getDistributionByBranch = async (req, res) => {
    const { fromDate, toDate, kindId, compareWith } = req.query;

    try {
        const request = new sql.Request();

        let query = `
            SELECT 
                b.IDbranch as branchId,
                b.branchName,
                COUNT(*) as transactions,
                ISNULL(SUM(d.incomeAmount), 0) as amount
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            LEFT JOIN tbl_Branch b ON d.incomBranchtxt = b.IDbranch
            WHERE 1=1
        `;

        if (fromDate) {
            query += ` AND i.incomeDate >= @fromDate`;
            request.input('fromDate', sql.Date, fromDate);
        }
        if (toDate) {
            query += ` AND i.incomeDate <= @toDate`;
            request.input('toDate', sql.Date, toDate);
        }
        if (kindId) {
            query += ` AND d.incomeKind = @kindId`;
            request.input('kindId', sql.SmallInt, kindId);
        }

        query += ` GROUP BY b.IDbranch, b.branchName ORDER BY amount DESC`;

        const currentResult = await request.query(query);

        // حساب النسب المئوية
        const total = currentResult.recordset.reduce((sum, item) => sum + item.amount, 0);
        const dataWithPercentage = currentResult.recordset.map(item => ({
            ...item,
            percentage: total > 0 ? (item.amount / total) * 100 : 0
        }));

        // بيانات الفترة السابقة
        let previousData = [];
        if (compareWith && fromDate && toDate) {
            const from = new Date(fromDate);
            const to = new Date(toDate);
            const diff = to - from;

            let prevFrom, prevTo;

            if (compareWith === 'previousPeriod') {
                prevTo = new Date(from.getTime() - 1);
                prevFrom = new Date(prevTo.getTime() - diff);
            } else if (compareWith === 'lastYear') {
                prevFrom = new Date(from);
                prevFrom.setFullYear(prevFrom.getFullYear() - 1);
                prevTo = new Date(to);
                prevTo.setFullYear(prevTo.getFullYear() - 1);
            }

            if (prevFrom && prevTo) {
                const prevRequest = new sql.Request();
                let prevQuery = `
                    SELECT 
                        b.IDbranch as branchId,
                        ISNULL(SUM(d.incomeAmount), 0) as amount
                    FROM tbl_income i
                    INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
                    LEFT JOIN tbl_Branch b ON d.incomBranchtxt = b.IDbranch
                    WHERE i.incomeDate >= @prevFrom AND i.incomeDate <= @prevTo
                `;

                prevRequest.input('prevFrom', sql.Date, prevFrom);
                prevRequest.input('prevTo', sql.Date, prevTo);

                if (kindId) {
                    prevQuery += ` AND d.incomeKind = @kindId`;
                    prevRequest.input('kindId', sql.SmallInt, kindId);
                }

                prevQuery += ` GROUP BY b.IDbranch`;

                const prevResult = await prevRequest.query(prevQuery);
                previousData = prevResult.recordset;
            }
        }

        // حساب نسب التغيير
        const dataWithChanges = dataWithPercentage.map(item => {
            const prevItem = previousData.find(p => p.branchId === item.branchId);
            const change = prevItem && prevItem.amount > 0 
                ? ((item.amount - prevItem.amount) / prevItem.amount) * 100 
                : null;
            return { ...item, change };
        });

        res.status(200).json({
            success: true,
            data: dataWithChanges,
            total: total
        });

    } catch (err) {
        console.error('Error in getDistributionByBranch:', err);
        res.status(500).json({ success: false, message: 'خطأ في جلب التوزيع', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 5️⃣ تحليل الأيام والأسابيع
// ═══════════════════════════════════════════════════════════════
const getTrendsAnalysis = async (req, res) => {
    const { fromDate, toDate, branchId, kindId } = req.query;

    try {
        const request = new sql.Request();

        // تحليل حسب أيام الأسبوع
        let dayQuery = `
            SELECT 
                DATEPART(WEEKDAY, i.incomeDate) as dayOfWeek,
                DATENAME(WEEKDAY, i.incomeDate) as dayName,
                COUNT(*) as transactions,
                ISNULL(SUM(d.incomeAmount), 0) as amount,
                ISNULL(AVG(d.incomeAmount), 0) as avgAmount
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            WHERE 1=1
        `;

        if (fromDate) {
            dayQuery += ` AND i.incomeDate >= @fromDate`;
            request.input('fromDate', sql.Date, fromDate);
        }
        if (toDate) {
            dayQuery += ` AND i.incomeDate <= @toDate`;
            request.input('toDate', sql.Date, toDate);
        }
        if (branchId) {
            dayQuery += ` AND d.incomBranchtxt = @branchId`;
            request.input('branchId', sql.SmallInt, branchId);
        }
        if (kindId) {
            dayQuery += ` AND d.incomeKind = @kindId`;
            request.input('kindId', sql.SmallInt, kindId);
        }

        dayQuery += ` GROUP BY DATEPART(WEEKDAY, i.incomeDate), DATENAME(WEEKDAY, i.incomeDate) ORDER BY dayOfWeek`;

        const dayResult = await request.query(dayQuery);

        // تحليل حسب الأسابيع
        const weekRequest = new sql.Request();
        let weekQuery = `
            SELECT 
                DATEPART(WEEK, i.incomeDate) as weekNumber,
                MIN(CAST(i.incomeDate as DATE)) as weekStart,
                MAX(CAST(i.incomeDate as DATE)) as weekEnd,
                COUNT(*) as transactions,
                ISNULL(SUM(d.incomeAmount), 0) as amount
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            WHERE 1=1
        `;

        if (fromDate) {
            weekQuery += ` AND i.incomeDate >= @fromDate`;
            weekRequest.input('fromDate', sql.Date, fromDate);
        }
        if (toDate) {
            weekQuery += ` AND i.incomeDate <= @toDate`;
            weekRequest.input('toDate', sql.Date, toDate);
        }
        if (branchId) {
            weekQuery += ` AND d.incomBranchtxt = @branchId`;
            weekRequest.input('branchId', sql.SmallInt, branchId);
        }
        if (kindId) {
            weekQuery += ` AND d.incomeKind = @kindId`;
            weekRequest.input('kindId', sql.SmallInt, kindId);
        }

        weekQuery += ` GROUP BY DATEPART(WEEK, i.incomeDate) ORDER BY weekNumber`;

        const weekResult = await weekRequest.query(weekQuery);

        // حساب النسب المئوية والتحديد الأفضل/الأسوأ
        const totalDayAmount = dayResult.recordset.reduce((sum, d) => sum + d.amount, 0);
        const daysWithPercentage = dayResult.recordset.map(d => ({
            ...d,
            percentage: totalDayAmount > 0 ? (d.amount / totalDayAmount) * 100 : 0
        }));

        const totalWeekAmount = weekResult.recordset.reduce((sum, w) => sum + w.amount, 0);
        const weeksWithPercentage = weekResult.recordset.map(w => ({
            ...w,
            percentage: totalWeekAmount > 0 ? (w.amount / totalWeekAmount) * 100 : 0
        }));

        // تحديد الأفضل والأسوأ
        const bestDay = daysWithPercentage.reduce((max, d) => d.amount > max.amount ? d : max, daysWithPercentage[0] || {});
        const worstDay = daysWithPercentage.reduce((min, d) => d.amount < min.amount ? d : min, daysWithPercentage[0] || {});
        const bestWeek = weeksWithPercentage.reduce((max, w) => w.amount > max.amount ? w : max, weeksWithPercentage[0] || {});
        const worstWeek = weeksWithPercentage.reduce((min, w) => w.amount < min.amount ? w : min, weeksWithPercentage[0] || {});

        res.status(200).json({
            success: true,
            data: {
                byDay: daysWithPercentage,
                byWeek: weeksWithPercentage,
                insights: {
                    bestDay: bestDay,
                    worstDay: worstDay,
                    bestWeek: bestWeek,
                    worstWeek: worstWeek
                }
            }
        });

    } catch (err) {
        console.error('Error in getTrendsAnalysis:', err);
        res.status(500).json({ success: false, message: 'خطأ في تحليل الاتجاهات', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 6️⃣ معدلات النمو
// ═══════════════════════════════════════════════════════════════
const getGrowthRates = async (req, res) => {
    const { year, branchId, kindId } = req.query;

    try {
        const targetYear = year || new Date().getFullYear();
        const request = new sql.Request();

        let query = `
            SELECT 
                MONTH(i.incomeDate) as month,
                DATENAME(MONTH, i.incomeDate) as monthName,
                ISNULL(SUM(d.incomeAmount), 0) as amount,
                COUNT(*) as transactions
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            WHERE YEAR(i.incomeDate) = @year
        `;

        request.input('year', sql.Int, targetYear);

        if (branchId) {
            query += ` AND d.incomBranchtxt = @branchId`;
            request.input('branchId', sql.SmallInt, branchId);
        }
        if (kindId) {
            query += ` AND d.incomeKind = @kindId`;
            request.input('kindId', sql.SmallInt, kindId);
        }

        query += ` GROUP BY MONTH(i.incomeDate), DATENAME(MONTH, i.incomeDate) ORDER BY month`;

        const currentResult = await request.query(query);

        // بيانات السنة السابقة
        const prevRequest = new sql.Request();
        let prevQuery = `
            SELECT 
                MONTH(i.incomeDate) as month,
                ISNULL(SUM(d.incomeAmount), 0) as amount
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            WHERE YEAR(i.incomeDate) = @prevYear
        `;

        prevRequest.input('prevYear', sql.Int, targetYear - 1);

        if (branchId) {
            prevQuery += ` AND d.incomBranchtxt = @branchId`;
            prevRequest.input('branchId', sql.SmallInt, branchId);
        }
        if (kindId) {
            prevQuery += ` AND d.incomeKind = @kindId`;
            prevRequest.input('kindId', sql.SmallInt, kindId);
        }

        prevQuery += ` GROUP BY MONTH(i.incomeDate) ORDER BY month`;

        const prevResult = await prevRequest.query(prevQuery);

        // حساب معدلات النمو
        const dataWithGrowth = currentResult.recordset.map(item => {
            const prevItem = prevResult.recordset.find(p => p.month === item.month);
            const prevAmount = prevItem ? prevItem.amount : 0;
            const growth = prevAmount > 0 
                ? ((item.amount - prevAmount) / prevAmount) * 100 
                : (item.amount > 0 ? 100 : 0);

            return {
                ...item,
                previousAmount: prevAmount,
                growth: growth
            };
        });

        // حساب الإجماليات
        const totalCurrent = currentResult.recordset.reduce((sum, m) => sum + m.amount, 0);
        const totalPrevious = prevResult.recordset.reduce((sum, m) => sum + m.amount, 0);
        const avgMonthlyGrowth = dataWithGrowth.length > 0 
            ? dataWithGrowth.reduce((sum, m) => sum + m.growth, 0) / dataWithGrowth.length 
            : 0;
        const yearlyGrowth = totalPrevious > 0 
            ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 
            : 0;

        res.status(200).json({
            success: true,
            data: {
                monthly: dataWithGrowth,
                summary: {
                    totalCurrent: totalCurrent,
                    totalPrevious: totalPrevious,
                    yearlyGrowth: yearlyGrowth,
                    avgMonthlyGrowth: avgMonthlyGrowth
                }
            }
        });

    } catch (err) {
        console.error('Error in getGrowthRates:', err);
        res.status(500).json({ success: false, message: 'خطأ في حساب معدلات النمو', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 7️⃣ المقارنة التفصيلية
// ═══════════════════════════════════════════════════════════════
const getDetailedComparison = async (req, res) => {
    const { fromDate, toDate, compareWith, branchId, kindId } = req.query;

    try {
        if (!fromDate || !toDate || !compareWith) {
            return res.status(400).json({ 
                success: false, 
                message: 'fromDate, toDate, compareWith مطلوبين' 
            });
        }

        const from = new Date(fromDate);
        const to = new Date(toDate);
        const diff = to - from;

        let prevFrom, prevTo;

        if (compareWith === 'previousPeriod') {
            prevTo = new Date(from.getTime() - 1);
            prevFrom = new Date(prevTo.getTime() - diff);
        } else if (compareWith === 'lastYear') {
            prevFrom = new Date(from);
            prevFrom.setFullYear(prevFrom.getFullYear() - 1);
            prevTo = new Date(to);
            prevTo.setFullYear(prevTo.getFullYear() - 1);
        }

        // الفترة الحالية
        const currentRequest = new sql.Request();
        let currentQuery = `
            SELECT 
                'current' as period,
                COUNT(*) as transactions,
                ISNULL(SUM(d.incomeAmount), 0) as totalAmount,
                ISNULL(AVG(d.incomeAmount), 0) as avgAmount,
                ISNULL(MAX(d.incomeAmount), 0) as maxAmount,
                ISNULL(MIN(d.incomeAmount), 0) as minAmount
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            WHERE i.incomeDate >= @fromDate AND i.incomeDate <= @toDate
        `;

        currentRequest.input('fromDate', sql.Date, fromDate);
        currentRequest.input('toDate', sql.Date, toDate);

        if (branchId) {
            currentQuery += ` AND d.incomBranchtxt = @branchId`;
            currentRequest.input('branchId', sql.SmallInt, branchId);
        }
        if (kindId) {
            currentQuery += ` AND d.incomeKind = @kindId`;
            currentRequest.input('kindId', sql.SmallInt, kindId);
        }

        const currentResult = await currentRequest.query(currentQuery);

        // الفترة السابقة
        const prevRequest = new sql.Request();
        let prevQuery = `
            SELECT 
                'previous' as period,
                COUNT(*) as transactions,
                ISNULL(SUM(d.incomeAmount), 0) as totalAmount,
                ISNULL(AVG(d.incomeAmount), 0) as avgAmount,
                ISNULL(MAX(d.incomeAmount), 0) as maxAmount,
                ISNULL(MIN(d.incomeAmount), 0) as minAmount
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            WHERE i.incomeDate >= @prevFrom AND i.incomeDate <= @prevTo
        `;

        prevRequest.input('prevFrom', sql.Date, prevFrom);
        prevRequest.input('prevTo', sql.Date, prevTo);

        if (branchId) {
            prevQuery += ` AND d.incomBranchtxt = @branchId`;
            prevRequest.input('branchId', sql.SmallInt, branchId);
        }
        if (kindId) {
            prevQuery += ` AND d.incomeKind = @kindId`;
            prevRequest.input('kindId', sql.SmallInt, kindId);
        }

        const prevResult = await prevRequest.query(prevQuery);

        const current = currentResult.recordset[0];
        const previous = prevResult.recordset[0];

        // حساب التغييرات
        const calculateChange = (curr, prev) => {
            if (!prev || prev === 0) return curr > 0 ? 100 : 0;
            return ((curr - prev) / prev) * 100;
        };

        res.status(200).json({
            success: true,
            data: {
                current: {
                    ...current,
                    fromDate: fromDate,
                    toDate: toDate
                },
                previous: {
                    ...previous,
                    fromDate: prevFrom,
                    toDate: prevTo
                },
                changes: {
                    transactions: calculateChange(current.transactions, previous.transactions),
                    totalAmount: calculateChange(current.totalAmount, previous.totalAmount),
                    avgAmount: calculateChange(current.avgAmount, previous.avgAmount),
                    maxAmount: calculateChange(current.maxAmount, previous.maxAmount)
                }
            }
        });

    } catch (err) {
        console.error('Error in getDetailedComparison:', err);
        res.status(500).json({ success: false, message: 'خطأ في المقارنة', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 8️⃣ الملخص التنفيذي
// ═══════════════════════════════════════════════════════════════
const getExecutiveSummary = async (req, res) => {
    const { fromDate, toDate, branchId } = req.query;

    try {
        const request = new sql.Request();

        if (fromDate) request.input('fromDate', sql.Date, fromDate);
        if (toDate) request.input('toDate', sql.Date, toDate);
        if (branchId) request.input('branchId', sql.SmallInt, branchId);

        // الإيجابيات
        let positiveQuery = `
            SELECT TOP 3
                k.incomeKind as name,
                ISNULL(SUM(d.incomeAmount), 0) as amount,
                'نوع' as category
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            LEFT JOIN tbl_incomeKind k ON d.incomeKind = k.ID
            WHERE 1=1
        `;

        if (fromDate) positiveQuery += ` AND i.incomeDate >= @fromDate`;
        if (toDate) positiveQuery += ` AND i.incomeDate <= @toDate`;
        if (branchId) positiveQuery += ` AND d.incomBranchtxt = @branchId`;

        positiveQuery += ` GROUP BY k.incomeKind ORDER BY amount DESC`;

        const positiveResult = await request.query(positiveQuery);

        // أفضل فرع
        const branchRequest = new sql.Request();
        if (fromDate) branchRequest.input('fromDate', sql.Date, fromDate);
        if (toDate) branchRequest.input('toDate', sql.Date, toDate);

        let branchQuery = `
            SELECT TOP 1
                b.branchName as name,
                ISNULL(SUM(d.incomeAmount), 0) as amount
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            LEFT JOIN tbl_Branch b ON d.incomBranchtxt = b.IDbranch
            WHERE 1=1
        `;

        if (fromDate) branchQuery += ` AND i.incomeDate >= @fromDate`;
        if (toDate) branchQuery += ` AND i.incomeDate <= @toDate`;

        branchQuery += ` GROUP BY b.branchName ORDER BY amount DESC`;

        const bestBranchResult = await branchRequest.query(branchQuery);

        // أفضل يوم
        const dayRequest = new sql.Request();
        if (fromDate) dayRequest.input('fromDate', sql.Date, fromDate);
        if (toDate) dayRequest.input('toDate', sql.Date, toDate);
        if (branchId) dayRequest.input('branchId', sql.SmallInt, branchId);

        let dayQuery = `
            SELECT TOP 1
                DATENAME(WEEKDAY, i.incomeDate) as name,
                ISNULL(SUM(d.incomeAmount), 0) as amount
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            WHERE 1=1
        `;

        if (fromDate) dayQuery += ` AND i.incomeDate >= @fromDate`;
        if (toDate) dayQuery += ` AND i.incomeDate <= @toDate`;
        if (branchId) dayQuery += ` AND d.incomBranchtxt = @branchId`;

        dayQuery += ` GROUP BY DATENAME(WEEKDAY, i.incomeDate) ORDER BY amount DESC`;

        const bestDayResult = await dayRequest.query(dayQuery);

        // أقل يوم
        let worstDayQuery = dayQuery.replace('ORDER BY amount DESC', 'ORDER BY amount ASC');
        const worstDayResult = await dayRequest.query(worstDayQuery);

        res.status(200).json({
            success: true,
            data: {
                positives: [
                    ...positiveResult.recordset.map(p => ({ type: 'kind', ...p })),
                    bestBranchResult.recordset[0] ? { type: 'branch', name: `فرع ${bestBranchResult.recordset[0].name} الأعلى تحصيلاً`, amount: bestBranchResult.recordset[0].amount } : null,
                    bestDayResult.recordset[0] ? { type: 'day', name: `${bestDayResult.recordset[0].name} أفضل يوم للتحصيل`, amount: bestDayResult.recordset[0].amount } : null
                ].filter(Boolean),
                warnings: [
                    worstDayResult.recordset[0] ? { type: 'day', name: `${worstDayResult.recordset[0].name} أقل يوم تحصيل`, amount: worstDayResult.recordset[0].amount } : null
                ].filter(Boolean),
                recommendations: [
                    'زيادة العروض في الأيام الضعيفة',
                    'تفعيل الفروع الأقل تحصيلاً',
                    'استغلال أيام الذروة لأقصى تحصيل'
                ]
            }
        });

    } catch (err) {
        console.error('Error in getExecutiveSummary:', err);
        res.status(500).json({ success: false, message: 'خطأ في الملخص التنفيذي', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// تصدير الدوال
// ═══════════════════════════════════════════════════════════════
module.exports = {
    getMainKPIs,
    getChartData,
    getDistributionByKind,
    getDistributionByBranch,
    getTrendsAnalysis,
    getGrowthRates,
    getDetailedComparison,
    getExecutiveSummary
};