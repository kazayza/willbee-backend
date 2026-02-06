const { sql } = require('../config/db');
const { createAndPushNotification } = require('./notificationController'); // 👈 استيراد الإشعارات

// ═══════════════════════════════════════════════════════════════
// 🔔 دالة الإشعارات المساعدة (نفس نسخة الإيرادات)
// ═══════════════════════════════════════════════════════════════
const notifyAdminsAndAccountants = async (title, message, type, relatedTo, relatedId) => {
    try {
        const request = new sql.Request();
        // بنبعت للمدير (Admin) والمحاسب (AccountantUser)
        const result = await request.query(`
            SELECT UserId FROM tbl_users 
            WHERE Role IN ('Admin', 'AccountantUser')
        `);

        for (const user of result.recordset) {
            await createAndPushNotification(
                user.UserId,
                title,
                message,
                type,
                relatedTo,
                relatedId
            );
        }
    } catch (err) {
        console.error('❌ Notification Error:', err.message);
    }
};

// ===== 1. عرض المصروفات (مع الفلترة المطلوبة) =====
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
                e.Addtime
            FROM tbl_expenses e
            INNER JOIN tbl_ExpensesDetalis d ON e.ID = d.IDExpense
            LEFT JOIN tbl_expenseKind k ON d.expenseKind = k.ID
            LEFT JOIN tbl_Branch b ON d.expenseBranchtxt = b.IDbranch
            WHERE e.Kind = 'اخرى'        -- 👈 الفلتر الأول: النوع الرئيسي
              AND d.expenseKind <> 8     -- 👈 الفلتر الثاني: استبعاد النوع الفرعي 8
            ORDER BY e.expenseDate DESC
        `;
        const result = await sql.query(query);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching expenses', error: err.message });
    }
};

// ===== 2. جلب أنواع المصروفات (استبعاد رقم 8 أيضاً) =====
const getExpenseKinds = async (req, res) => {
    try {
        // بنستبعد رقم 8 من القائمة عشان محدش يختاره بالغلط
        const result = await sql.query('SELECT ID, expenseKind, KindGroup FROM tbl_expenseKind WHERE ID <> 8 ORDER BY KindGroup, expenseKind');
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

// ===== 4. إضافة مصروف (مع إشعار) =====
const addExpense = async (req, res) => {
    const { amount, byan, date, user, kindId, branchId } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // تسجيل الرأس
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

        // 🔔 إرسال الإشعار
        await notifyAdminsAndAccountants(
            '💸 مصروف جديد',
            `تم صرف ${amount} ج.م (${byan || 'بدون بيان'}) بواسطة ${user}`,
            'Expense',
            'expense',
            newExpenseID
        );

        res.status(201).json({ message: 'تم تسجيل المصروف بنجاح ✅', id: newExpenseID });

    } catch (err) {
        await transaction.rollback();
        console.error('Add Expense Error:', err);
        res.status(500).json({ message: 'Failed to add expense', error: err.message });
    }
};

// ===== 5. تعديل مصروف (مع إشعار) =====
const updateExpense = async (req, res) => {
    const { id } = req.params;
    const { amount, byan, date, kindId, branchId, user } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        const requestHead = new sql.Request(transaction);
        requestHead.input('id', sql.Int, parseInt(id));
        requestHead.input('date', sql.DateTime, date ? new Date(date) : new Date());
        requestHead.input('user', sql.NVarChar, user || 'AppUser');

        await requestHead.query(`
            UPDATE tbl_expenses 
            SET expenseDate = @date, useredit = @user, editTime = GETDATE()
            WHERE ID = @id
        `);

        const requestDetail = new sql.Request(transaction);
        requestDetail.input('expID', sql.Int, parseInt(id));
        requestDetail.input('amount', sql.Decimal(18, 2), amount);
        requestDetail.input('byan', sql.NVarChar, byan || '');
        requestDetail.input('kind', sql.Int, kindId);
        requestDetail.input('branch', sql.Int, branchId);

        await requestDetail.query(`
            UPDATE tbl_ExpensesDetalis 
            SET expenseAmount = @amount, Byan = @byan, expenseKind = @kind, expenseBranchtxt = @branch
            WHERE IDExpense = @expID
        `);

        await transaction.commit();

        // 🔔 إرسال الإشعار
        await notifyAdminsAndAccountants(
            '✏️ تعديل مصروف',
            `تم تعديل مصروف رقم #${id} (${amount} ج.م) بواسطة ${user}`,
            'Expense',
            'expense',
            parseInt(id)
        );

        res.status(200).json({ message: 'تم تحديث المصروف بنجاح ✅' });

    } catch (err) {
        await transaction.rollback();
        console.error('Update Expense Error:', err);
        res.status(500).json({ message: 'Failed to update expense', error: err.message });
    }
};

// ===== 6. حذف مصروف (مع جلب البيانات قبل الحذف للإشعار) =====
const deleteExpense = async (req, res) => {
    const { id } = req.params;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 🔍 جلب البيانات قبل الحذف (عشان الإشعار)
        const getDataRequest = new sql.Request(transaction);
        getDataRequest.input('id', sql.Int, parseInt(id));
        const expenseData = await getDataRequest.query(`
            SELECT expenseAmount, Byan FROM tbl_ExpensesDetalis WHERE IDExpense = @id
        `);
        
        const amount = expenseData.recordset[0]?.expenseAmount || 0;
        const byan = expenseData.recordset[0]?.Byan || 'مصروف';

        // الحذف
        const requestDetail = new sql.Request(transaction);
        requestDetail.input('expID', sql.Int, parseInt(id));
        await requestDetail.query('DELETE FROM tbl_ExpensesDetalis WHERE IDExpense = @expID');

        const requestHead = new sql.Request(transaction);
        requestHead.input('id', sql.Int, parseInt(id));
        await requestHead.query('DELETE FROM tbl_expenses WHERE ID = @id');

        await transaction.commit();

        // 🔔 إرسال الإشعار (للمديرين فقط زي الإيرادات)
        // وممكن نبعته للمحاسب كمان لو تحب، بس الكود هنا زي الإيرادات للمديرين
        const adminRequest = new sql.Request();
        const admins = await adminRequest.query(`SELECT UserId FROM tbl_users WHERE Role = 'Admin'`);

        for (const admin of admins.recordset) {
            await createAndPushNotification(
                admin.UserId,
                '🗑️ حذف مصروف',
                `تم حذف مصروف "${byan}" بمبلغ ${amount} ج.م`,
                'Expense',
                'expense',
                parseInt(id)
            );
        }

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