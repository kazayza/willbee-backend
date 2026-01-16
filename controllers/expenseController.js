const { sql } = require('../config/db');

// 1. عرض المصروفات (شامل النوع والفرع)
const getAllExpenses = async (req, res) => {
    try {
        const query = `
            SELECT 
                e.ID, 
                e.expenseDate, 
                k.expenseKind as KindName,   -- اسم النوع
                b.branchName,                -- اسم الفرع
                d.expenseAmount, 
                d.Byan,
                e.userAdd
            FROM tbl_expenses e
            INNER JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            LEFT JOIN tbl_Branch b ON d.expenseBranchtxt = b.IDbranch -- ربطنا بجدول الفروع
            ORDER BY e.expenseDate DESC
        `;
        const result = await sql.query(query);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching expenses', error: err.message });
    }
};

// 2. جلب أنواع المصروفات
const getExpenseKinds = async (req, res) => {
    try {
        const result = await sql.query('SELECT ID, expenseKind FROM tbl_expenseKind');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching kinds', error: err.message });
    }
};

// 3. جلب قائمة الفروع (جديد) 🏢
const getBranches = async (req, res) => {
    try {
        const result = await sql.query('SELECT IDbranch, branchName FROM tbl_Branch');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching branches', error: err.message });
    }
};

// 4. إضافة مصروف (مع النوع والفرع)
const addExpense = async (req, res) => {
    // kindId = رقم النوع، branchId = رقم الفرع
    const { amount, byan, date, user, kindId, branchId } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // تسجيل رأس الفاتورة
        const requestHead = new sql.Request(transaction);
        requestHead.input('date', sql.DateTime, date || new Date());
        requestHead.input('user', sql.VarChar, user || 'AppUser');
        requestHead.input('kindText', sql.VarChar, 'اخرى');

        const headResult = await requestHead.query(`
            INSERT INTO tbl_expenses (expenseDate, Kind, userAdd, Addtime)
            OUTPUT inserted.ID
            VALUES (@date, @kindText, @user, GETDATE())
        `);

        const newExpenseID = headResult.recordset[0].ID;

        // تسجيل التفاصيل (شامل الفرع والنوع)
        const requestDetail = new sql.Request(transaction);
        requestDetail.input('expID', sql.Int, newExpenseID);
        requestDetail.input('amount', sql.Decimal(9, 2), amount);
        requestDetail.input('byan', sql.VarChar, byan);
        requestDetail.input('kind', sql.SmallInt, kindId);   
        requestDetail.input('branch', sql.SmallInt, branchId); // إضافة الفرع هنا

        await requestDetail.query(`
            INSERT INTO tbl_ExpensesDetalis 
            (IDExpense, expenseAmount, Byan, expenseKind, expenseBranchtxt)
            VALUES 
            (@expID, @amount, @byan, @kind, @branch)
        `);

        await transaction.commit();
        res.status(201).json({ message: 'تم تسجيل المصروف بنجاح ✅', id: newExpenseID });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'Failed to add expense', error: err.message });
    }
};

module.exports = {
    getAllExpenses,
    getExpenseKinds,
    getBranches, // تصدير الدالة الجديدة
    addExpense
};