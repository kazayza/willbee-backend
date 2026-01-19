const { sql } = require('../config/db');

// ===== 1. عرض المصروفات =====
const getAllExpenses = async (req, res) => {
    try {
        const query = `
            SELECT 
                e.ID, 
                e.expenseDate, 
                k.expenseKind as KindName,
                b.branchName,
                d.expenseAmount, 
                d.Byan,
                e.userAdd,
                e.Addtime,
                e.useredit,
                e.editTime
            FROM tbl_expenses e
            INNER JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            LEFT JOIN tbl_Branch b ON d.expenseBranchtxt = b.IDbranch
            ORDER BY e.expenseDate DESC
        `;
        const result = await sql.query(query);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching expenses', error: err.message });
    }
};

// ===== 2. جلب أنواع المصروفات =====
const getExpenseKinds = async (req, res) => {
    try {
        const result = await sql.query('SELECT ID, expenseKind, KindGroup FROM tbl_expenseKind ORDER BY KindGroup, expenseKind');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching kinds', error: err.message });
    }
};

// ===== 3. جلب الفروع =====
const getBranches = async (req, res) => {
    try {
        const result = await sql.query('SELECT IDbranch, branchName FROM tbl_Branch ORDER BY branchName');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching branches', error: err.message });
    }
};

// ===== 4. إضافة مصروف =====
const addExpense = async (req, res) => {
    const { amount, byan, date, user, kindId, branchId } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // تسجيل رأس الفاتورة
        const requestHead = new sql.Request(transaction);
        requestHead.input('date', sql.DateTime, date || new Date());
        requestHead.input('user', sql.NVarChar, user || 'AppUser');
        requestHead.input('kindText', sql.NVarChar, 'اخرى');

        const headResult = await requestHead.query(`
            INSERT INTO tbl_expenses (expenseDate, Kind, userAdd, Addtime)
            OUTPUT inserted.ID
            VALUES (@date, @kindText, @user, GETDATE())
        `);

        const newExpenseID = headResult.recordset[0].ID;

        // تسجيل التفاصيل
        const requestDetail = new sql.Request(transaction);
        requestDetail.input('expID', sql.Int, newExpenseID);
        requestDetail.input('amount', sql.Decimal(18, 2), amount);
        requestDetail.input('byan', sql.NVarChar, byan || '');
        requestDetail.input('kind', sql.Int, kindId);
        requestDetail.input('branch', sql.Int, branchId);

        await requestDetail.query(`
            INSERT INTO tbl_ExpensesDetalis 
            (IDExpense, expenseAmount, Byan, expenseKind, expenseBranchtxt)
            VALUES 
            (@expID, @amount, @byan, @kind, @branch)
        `);

        await transaction.commit();
        res.status(201).json({ 
            message: 'تم تسجيل المصروف بنجاح ✅', 
            id: newExpenseID 
        });

    } catch (err) {
        await transaction.rollback();
        console.error('Add Expense Error:', err);
        res.status(500).json({ message: 'Failed to add expense', error: err.message });
    }
};

// ===== 5. تعديل مصروف ✅ =====
const updateExpense = async (req, res) => {
    const { id } = req.params;
    const { amount, byan, date, kindId, branchId, user } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // تحديث رأس الفاتورة
        const requestHead = new sql.Request(transaction);
        requestHead.input('id', sql.Int, parseInt(id));
        requestHead.input('date', sql.DateTime, date ? new Date(date) : new Date());
        requestHead.input('user', sql.NVarChar, user || 'AppUser');

        await requestHead.query(`
            UPDATE tbl_expenses 
            SET expenseDate = @date,
                useredit = @user,
                editTime = GETDATE()
            WHERE ID = @id
        `);

        // تحديث التفاصيل
        const requestDetail = new sql.Request(transaction);
        requestDetail.input('expID', sql.Int, parseInt(id));
        requestDetail.input('amount', sql.Decimal(18, 2), amount);
        requestDetail.input('byan', sql.NVarChar, byan || '');
        requestDetail.input('kind', sql.Int, kindId);
        requestDetail.input('branch', sql.Int, branchId);

        await requestDetail.query(`
            UPDATE tbl_ExpensesDetalis 
            SET expenseAmount = @amount,
                Byan = @byan,
                expenseKind = @kind,
                expenseBranchtxt = @branch
            WHERE IDExpense = @expID
        `);

        await transaction.commit();
        res.status(200).json({ message: 'تم تحديث المصروف بنجاح ✅' });

    } catch (err) {
        await transaction.rollback();
        console.error('Update Expense Error:', err);
        res.status(500).json({ message: 'Failed to update expense', error: err.message });
    }
};

// ===== 6. حذف مصروف ✅ =====
const deleteExpense = async (req, res) => {
    const { id } = req.params;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // حذف التفاصيل أولاً (بسبب العلاقة)
        const requestDetail = new sql.Request(transaction);
        requestDetail.input('expID', sql.Int, parseInt(id));
        await requestDetail.query('DELETE FROM tbl_ExpensesDetalis WHERE IDExpense = @expID');

        // حذف رأس الفاتورة
        const requestHead = new sql.Request(transaction);
        requestHead.input('id', sql.Int, parseInt(id));
        await requestHead.query('DELETE FROM tbl_expenses WHERE ID = @id');

        await transaction.commit();
        res.status(200).json({ message: 'تم حذف المصروف بنجاح ✅' });

    } catch (err) {
        await transaction.rollback();
        console.error('Delete Expense Error:', err);
        res.status(500).json({ message: 'Failed to delete expense', error: err.message });
    }
};

module.exports = {
    getAllExpenses,
    getExpenseKinds,
    getBranches,
    addExpense,
    updateExpense,
    deleteExpense
};