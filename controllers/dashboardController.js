const { sql } = require('../config/db');

// دالة جلب إحصائيات الصفحة الرئيسية
const getHomeStats = async (req, res) => {
    try {
        const request = new sql.Request();

        // 1️⃣ عدد الأطفال (Active فقط)
        const childrenQuery = `SELECT COUNT(*) AS count FROM tbl_Child WHERE Status = 1`; // 1 = Active

        // 2️⃣ عدد الموظفين (Active فقط)
        const employeesQuery = `SELECT COUNT(*) AS count FROM tbl_empolyee WHERE empstatus = 1`;

        // 3️⃣ إجمالي إيرادات الشهر الحالي
        const incomeQuery = `
            SELECT SUM(incomeAmount) AS total 
            FROM tbl_incomeDetalis d
            INNER JOIN tbl_income i ON d.IDincome = i.ID
            WHERE MONTH(i.incomeDate) = MONTH(GETDATE()) 
            AND YEAR(i.incomeDate) = YEAR(GETDATE())
        `;

        // 4️⃣ إجمالي مصروفات الشهر الحالي
        const expenseQuery = `
            SELECT SUM(expenseAmount) AS total 
            FROM tbl_ExpensesDetalis d
            INNER JOIN tbl_expenses e ON d.IDExpense = e.ID
            WHERE MONTH(e.expenseDate) = MONTH(GETDATE()) 
            AND YEAR(e.expenseDate) = YEAR(GETDATE())
        `;

        // تنفيذ الاستعلامات (ممكن ندمجهم بس كده أوضح للكود)
        const [childRes, empRes, incRes, expRes] = await Promise.all([
            sql.query(childrenQuery),
            sql.query(employeesQuery),
            sql.query(incomeQuery),
            sql.query(expenseQuery)
        ]);

        // تجميع النتائج في شكل JSON بسيط
        const stats = {
            childrenCount: childRes.recordset[0].count || 0,
            employeesCount: empRes.recordset[0].count || 0,
            monthlyIncome: incRes.recordset[0].total || 0,
            monthlyExpense: expRes.recordset[0].total || 0,
            netProfit: (incRes.recordset[0].total || 0) - (expRes.recordset[0].total || 0) // صافي الربح
        };

        res.status(200).json(stats);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching stats', error: err.message });
    }
};

module.exports = {
    getHomeStats
};