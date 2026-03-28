const { sql } = require('../config/db');

// ============================================
// 🎯 الدالة الرئيسية: قائمة الأرباح والخسائر
// ============================================
const getProfitLossReport = async (req, res) => {
    try {
        const { startDate, endDate, branchId } = req.query;

        // التحقق من التواريخ
        if (!startDate || !endDate) {
            return res.status(400).json({ 
                error: 'يجب تحديد تاريخ البداية والنهاية',
                example: '?startDate=2025-01-01&endDate=2025-12-31'
            });
        }

        // ============================================
        // 📈 جلب الإيرادات مجمعة حسب المجموعة
        // ============================================
        let incomeQuery = `
            SELECT 
                ik.kindGroup AS groupName,
                SUM(ind.incomeAmount) AS totalAmount
            FROM tbl_incomeDetalis ind
            INNER JOIN tbl_income inc ON ind.IDincome = inc.ID
            INNER JOIN tbl_incomeKind ik ON ind.incomeKind = ik.ID
            WHERE inc.incomeDate BETWEEN @startDate AND @endDate
              AND ik.kindGroup NOT IN (N'رصيد مرحل', N'رصيد افتتاحي لاكاديميه')
        `;

        // ============================================
        // 📉 جلب المصروفات مجمعة حسب المجموعة
        // ============================================
        let expenseQuery = `
            SELECT 
                ek.KindGroup AS groupName,
                SUM(ed.expenseAmount) AS totalAmount
            FROM tbl_ExpensesDetalis ed
            INNER JOIN tbl_expenses ex ON ed.IDExpense = ex.ID
            INNER JOIN tbl_expenseKind ek ON ed.expenseKind = ek.ID
            WHERE ex.expenseDate BETWEEN @startDate AND @endDate
              AND ek.KindGroup NOT IN (N'ارصده ايجار دائنه', N'توزيعات ارباح')
        `;

        // إضافة فلتر الفرع لو موجود
        if (branchId && branchId !== 'all') {
            incomeQuery += ` AND ind.incomBranchtxt = @branchId`;
            expenseQuery += ` AND ed.expenseBranchtxt = @branchId`;
        }

        incomeQuery += ` GROUP BY ik.kindGroup ORDER BY SUM(ind.incomeAmount) DESC`;
        expenseQuery += ` GROUP BY ek.KindGroup ORDER BY SUM(ed.expenseAmount) DESC`;

        // تنفيذ الاستعلامات
        const request = new sql.Request();
        request.input('startDate', sql.Date, new Date(startDate));
        request.input('endDate', sql.Date, new Date(endDate));
        if (branchId && branchId !== 'all') {
            request.input('branchId', sql.SmallInt, parseInt(branchId));
        }

        const [incomeResult, expenseResult] = await Promise.all([
            request.query(incomeQuery),
            new sql.Request()
                .input('startDate', sql.Date, new Date(startDate))
                .input('endDate', sql.Date, new Date(endDate))
                .input('branchId', sql.SmallInt, branchId && branchId !== 'all' ? parseInt(branchId) : null)
                .query(expenseQuery)
        ]);

        // ============================================
        // 📊 تنظيم البيانات
        // ============================================
        
        // تصنيف الإيرادات
        const incomeGroups = {
            operational: [], // إيرادات تشغيلية
            other: []        // إيرادات أخرى
        };

        const operationalIncomeTypes = ['اشتراك', 'كورس', 'اشتراك الباص'];
        
        incomeResult.recordset.forEach(item => {
            const group = {
                name: item.groupName,
                amount: parseFloat(item.totalAmount) || 0
            };
            
            if (operationalIncomeTypes.includes(item.groupName)) {
                incomeGroups.operational.push(group);
            } else {
                incomeGroups.other.push(group);
            }
        });

        // تصنيف المصروفات
        const expenseGroups = {
            salaries: [],      // رواتب وأجور
            operational: [],   // مصروفات تشغيلية
            nonOperational: [] // مصروفات غير تشغيلية
        };

        const salaryTypes = ['أجور', 'مرتبات', 'Traning وتامينات'];
        const nonOperationalTypes = ['الضرائب', 'ديون سابقه', 'الاسترداد'];

        expenseResult.recordset.forEach(item => {
            const group = {
                name: item.groupName,
                amount: parseFloat(item.totalAmount) || 0
            };

            if (salaryTypes.includes(item.groupName)) {
                expenseGroups.salaries.push(group);
            } else if (nonOperationalTypes.includes(item.groupName)) {
                expenseGroups.nonOperational.push(group);
            } else {
                expenseGroups.operational.push(group);
            }
        });

        // ============================================
        // 💰 حساب الإجماليات
        // ============================================
        const totalOperationalIncome = incomeGroups.operational.reduce((sum, item) => sum + item.amount, 0);
        const totalOtherIncome = incomeGroups.other.reduce((sum, item) => sum + item.amount, 0);
        const totalIncome = totalOperationalIncome + totalOtherIncome;

        const totalSalaries = expenseGroups.salaries.reduce((sum, item) => sum + item.amount, 0);
        const totalOperationalExpenses = expenseGroups.operational.reduce((sum, item) => sum + item.amount, 0);
        const totalNonOperationalExpenses = expenseGroups.nonOperational.reduce((sum, item) => sum + item.amount, 0);
        const totalExpenses = totalSalaries + totalOperationalExpenses + totalNonOperationalExpenses;

        const operatingProfit = totalIncome - (totalSalaries + totalOperationalExpenses);
        const netProfit = totalIncome - totalExpenses;
        const profitMargin = totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(2) : 0;

        // ============================================
        // 📤 إرجاع النتيجة
        // ============================================
        res.status(200).json({
            success: true,
            period: {
                startDate,
                endDate,
                branchId: branchId || 'all'
            },
            income: {
                operational: {
                    items: incomeGroups.operational,
                    total: totalOperationalIncome
                },
                other: {
                    items: incomeGroups.other,
                    total: totalOtherIncome
                },
                grandTotal: totalIncome
            },
            expenses: {
                salaries: {
                    items: expenseGroups.salaries,
                    total: totalSalaries
                },
                operational: {
                    items: expenseGroups.operational,
                    total: totalOperationalExpenses
                },
                nonOperational: {
                    items: expenseGroups.nonOperational,
                    total: totalNonOperationalExpenses
                },
                grandTotal: totalExpenses
            },
            summary: {
                totalIncome,
                totalExpenses,
                operatingProfit,
                netProfit,
                profitMargin: parseFloat(profitMargin)
            }
        });

    } catch (err) {
        console.error('❌ Profit & Loss Report Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// 📊 ملخص سريع للـ Dashboard
// ============================================
const getProfitLossSummary = async (req, res) => {
    try {
        const { period } = req.query; // 'today', 'week', 'month', 'year'
        
        let dateCondition = '';
        switch (period) {
            case 'today':
                dateCondition = `CAST(GETDATE() AS DATE)`;
                break;
            case 'week':
                dateCondition = `DATEADD(WEEK, -1, GETDATE())`;
                break;
            case 'month':
                dateCondition = `DATEADD(MONTH, -1, GETDATE())`;
                break;
            case 'year':
                dateCondition = `DATEADD(YEAR, -1, GETDATE())`;
                break;
            default:
                dateCondition = `DATEADD(MONTH, -1, GETDATE())`;
        }

        const query = `
            -- إجمالي الإيرادات
            SELECT 
                'income' AS type,
                ISNULL(SUM(ind.incomeAmount), 0) AS total
            FROM tbl_incomeDetalis ind
            INNER JOIN tbl_income inc ON ind.IDincome = inc.ID
            INNER JOIN tbl_incomeKind ik ON ind.incomeKind = ik.ID
            WHERE inc.incomeDate >= ${dateCondition}
              AND ik.kindGroup NOT IN (N'رصيد مرحل', N'رصيد افتتاحي لاكاديميه')

            UNION ALL

            -- إجمالي المصروفات
            SELECT 
                'expense' AS type,
                ISNULL(SUM(ed.expenseAmount), 0) AS total
            FROM tbl_ExpensesDetalis ed
            INNER JOIN tbl_expenses ex ON ed.IDExpense = ex.ID
            INNER JOIN tbl_expenseKind ek ON ed.expenseKind = ek.ID
            WHERE ex.expenseDate >= ${dateCondition}
              AND ek.KindGroup NOT IN (N'ارصده ايجار دائنه', N'توزيعات ارباح')
        `;

        const result = await sql.query(query);
        
        const income = result.recordset.find(r => r.type === 'income')?.total || 0;
        const expense = result.recordset.find(r => r.type === 'expense')?.total || 0;
        const netProfit = income - expense;
        const profitMargin = income > 0 ? ((netProfit / income) * 100).toFixed(2) : 0;

        res.status(200).json({
            success: true,
            period: period || 'month',
            data: {
                totalIncome: income,
                totalExpenses: expense,
                netProfit,
                profitMargin: parseFloat(profitMargin),
                isProfit: netProfit >= 0
            }
        });

    } catch (err) {
        console.error('❌ Summary Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// 📈 مقارنة بين فترتين
// ============================================
const comparePeriods = async (req, res) => {
    try {
        const { 
            period1Start, period1End, 
            period2Start, period2End,
            branchId 
        } = req.query;

        if (!period1Start || !period1End || !period2Start || !period2End) {
            return res.status(400).json({ 
                error: 'يجب تحديد الفترتين للمقارنة'
            });
        }

        const getPeriodData = async (startDate, endDate) => {
            let incomeQuery = `
                SELECT ISNULL(SUM(ind.incomeAmount), 0) AS total
                FROM tbl_incomeDetalis ind
                INNER JOIN tbl_income inc ON ind.IDincome = inc.ID
                INNER JOIN tbl_incomeKind ik ON ind.incomeKind = ik.ID
                WHERE inc.incomeDate BETWEEN @startDate AND @endDate
                  AND ik.kindGroup NOT IN (N'رصيد مرحل', N'رصيد افتتاحي لاكاديميه')
            `;

            let expenseQuery = `
                SELECT ISNULL(SUM(ed.expenseAmount), 0) AS total
                FROM tbl_ExpensesDetalis ed
                INNER JOIN tbl_expenses ex ON ed.IDExpense = ex.ID
                INNER JOIN tbl_expenseKind ek ON ed.expenseKind = ek.ID
                WHERE ex.expenseDate BETWEEN @startDate AND @endDate
                  AND ek.KindGroup NOT IN (N'ارصده ايجار دائنه', N'توزيعات ارباح')
            `;

            if (branchId && branchId !== 'all') {
                incomeQuery += ` AND ind.incomBranchtxt = @branchId`;
                expenseQuery += ` AND ed.expenseBranchtxt = @branchId`;
            }

            const request = new sql.Request();
            request.input('startDate', sql.Date, new Date(startDate));
            request.input('endDate', sql.Date, new Date(endDate));
            if (branchId && branchId !== 'all') {
                request.input('branchId', sql.SmallInt, parseInt(branchId));
            }

            const [incomeResult, expenseResult] = await Promise.all([
                request.query(incomeQuery),
                new sql.Request()
                    .input('startDate', sql.Date, new Date(startDate))
                    .input('endDate', sql.Date, new Date(endDate))
                    .input('branchId', sql.SmallInt, branchId && branchId !== 'all' ? parseInt(branchId) : null)
                    .query(expenseQuery)
            ]);

            const income = incomeResult.recordset[0]?.total || 0;
            const expense = expenseResult.recordset[0]?.total || 0;
            
            return {
                income,
                expense,
                netProfit: income - expense
            };
        };

        const [period1Data, period2Data] = await Promise.all([
            getPeriodData(period1Start, period1End),
            getPeriodData(period2Start, period2End)
        ]);

        // حساب نسب التغيير
        const calcChange = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return (((current - previous) / previous) * 100).toFixed(2);
        };

        res.status(200).json({
            success: true,
            period1: {
                startDate: period1Start,
                endDate: period1End,
                ...period1Data
            },
            period2: {
                startDate: period2Start,
                endDate: period2End,
                ...period2Data
            },
            changes: {
                incomeChange: parseFloat(calcChange(period1Data.income, period2Data.income)),
                expenseChange: parseFloat(calcChange(period1Data.expense, period2Data.expense)),
                profitChange: parseFloat(calcChange(period1Data.netProfit, period2Data.netProfit))
            }
        });

    } catch (err) {
        console.error('❌ Compare Periods Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// 📊 تقرير شهري (12 شهر)
// ============================================
const getMonthlyTrend = async (req, res) => {
    try {
        const { year, branchId } = req.query;
        const selectedYear = year || new Date().getFullYear();

        let query = `
            WITH Months AS (
                SELECT 1 AS MonthNum UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
                UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8
                UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12
            ),
            IncomeData AS (
                SELECT 
                    MONTH(inc.incomeDate) AS MonthNum,
                    SUM(ind.incomeAmount) AS TotalIncome
                FROM tbl_incomeDetalis ind
                INNER JOIN tbl_income inc ON ind.IDincome = inc.ID
                INNER JOIN tbl_incomeKind ik ON ind.incomeKind = ik.ID
                WHERE YEAR(inc.incomeDate) = @year
                  AND ik.kindGroup NOT IN (N'رصيد مرحل', N'رصيد افتتاحي لاكاديميه')
                  ${branchId && branchId !== 'all' ? 'AND ind.incomBranchtxt = @branchId' : ''}
                GROUP BY MONTH(inc.incomeDate)
            ),
            ExpenseData AS (
                SELECT 
                    MONTH(ex.expenseDate) AS MonthNum,
                    SUM(ed.expenseAmount) AS TotalExpense
                FROM tbl_ExpensesDetalis ed
                INNER JOIN tbl_expenses ex ON ed.IDExpense = ex.ID
                INNER JOIN tbl_expenseKind ek ON ed.expenseKind = ek.ID
                WHERE YEAR(ex.expenseDate) = @year
                  AND ek.KindGroup NOT IN (N'ارصده ايجار دائنه', N'توزيعات ارباح')
                  ${branchId && branchId !== 'all' ? 'AND ed.expenseBranchtxt = @branchId' : ''}
                GROUP BY MONTH(ex.expenseDate)
            )
            SELECT 
                m.MonthNum,
                ISNULL(i.TotalIncome, 0) AS income,
                ISNULL(e.TotalExpense, 0) AS expense,
                ISNULL(i.TotalIncome, 0) - ISNULL(e.TotalExpense, 0) AS netProfit
            FROM Months m
            LEFT JOIN IncomeData i ON m.MonthNum = i.MonthNum
            LEFT JOIN ExpenseData e ON m.MonthNum = e.MonthNum
            ORDER BY m.MonthNum
        `;

        const request = new sql.Request();
        request.input('year', sql.Int, parseInt(selectedYear));
        if (branchId && branchId !== 'all') {
            request.input('branchId', sql.SmallInt, parseInt(branchId));
        }

        const result = await request.query(query);

        const monthNames = [
            'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
        ];

        const data = result.recordset.map(row => ({
            month: row.MonthNum,
            monthName: monthNames[row.MonthNum - 1],
            income: row.income,
            expense: row.expense,
            netProfit: row.netProfit
        }));

        // حساب الإجماليات
        const totals = data.reduce((acc, item) => ({
            income: acc.income + item.income,
            expense: acc.expense + item.expense,
            netProfit: acc.netProfit + item.netProfit
        }), { income: 0, expense: 0, netProfit: 0 });

        res.status(200).json({
            success: true,
            year: parseInt(selectedYear),
            branchId: branchId || 'all',
            months: data,
            totals
        });

    } catch (err) {
        console.error('❌ Monthly Trend Error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ============================================
// 🏢 تقرير بالفروع
// ============================================
const getReportByBranch = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'يجب تحديد تاريخ البداية والنهاية' });
        }

        const query = `
            SELECT 
                b.IDbranch,
                b.branchName,
                ISNULL(inc_data.TotalIncome, 0) AS totalIncome,
                ISNULL(exp_data.TotalExpense, 0) AS totalExpense,
                ISNULL(inc_data.TotalIncome, 0) - ISNULL(exp_data.TotalExpense, 0) AS netProfit
            FROM tbl_Branch b
            LEFT JOIN (
                SELECT 
                    ind.incomBranchtxt AS BranchID,
                    SUM(ind.incomeAmount) AS TotalIncome
                FROM tbl_incomeDetalis ind
                INNER JOIN tbl_income inc ON ind.IDincome = inc.ID
                INNER JOIN tbl_incomeKind ik ON ind.incomeKind = ik.ID
                WHERE inc.incomeDate BETWEEN @startDate AND @endDate
                  AND ik.kindGroup NOT IN (N'رصيد مرحل', N'رصيد افتتاحي لاكاديميه')
                GROUP BY ind.incomBranchtxt
            ) inc_data ON b.IDbranch = inc_data.BranchID
            LEFT JOIN (
                SELECT 
                    ed.expenseBranchtxt AS BranchID,
                    SUM(ed.expenseAmount) AS TotalExpense
                FROM tbl_ExpensesDetalis ed
                INNER JOIN tbl_expenses ex ON ed.IDExpense = ex.ID
                INNER JOIN tbl_expenseKind ek ON ed.expenseKind = ek.ID
                WHERE ex.expenseDate BETWEEN @startDate AND @endDate
                  AND ek.KindGroup NOT IN (N'ارصده ايجار دائنه', N'توزيعات ارباح')
                GROUP BY ed.expenseBranchtxt
            ) exp_data ON b.IDbranch = exp_data.BranchID
            ORDER BY netProfit DESC
        `;

        const request = new sql.Request();
        request.input('startDate', sql.Date, new Date(startDate));
        request.input('endDate', sql.Date, new Date(endDate));

        const result = await request.query(query);

        const totals = result.recordset.reduce((acc, item) => ({
            totalIncome: acc.totalIncome + item.totalIncome,
            totalExpense: acc.totalExpense + item.totalExpense,
            netProfit: acc.netProfit + item.netProfit
        }), { totalIncome: 0, totalExpense: 0, netProfit: 0 });

        res.status(200).json({
            success: true,
            period: { startDate, endDate },
            branches: result.recordset,
            totals
        });

    } catch (err) {
        console.error('❌ Branch Report Error:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getProfitLossReport,
    getProfitLossSummary,
    comparePeriods,
    getMonthlyTrend,
    getReportByBranch
};