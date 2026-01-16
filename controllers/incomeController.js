const { sql } = require('../config/db');

// 1. عرض الإيرادات (مع اسم الطفل والفرع والنوع)
const getAllIncomes = async (req, res) => {
    try {
        const query = `
            SELECT 
                i.ID, 
                i.incomeDate, 
                c.FullNameArabic as ChildName, -- اسم الطفل
                k.incomeKind as KindName,      -- نوع الإيراد
                b.branchName,                  -- الفرع
                d.incomeAmount, 
                d.ReceiptNumber,               -- رقم الإيصال الورقي
                d.Notes,
                i.userAdd
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            LEFT JOIN tbl_Child c ON d.child_ID = c.ID_Child
            LEFT JOIN tbl_incomeKind k ON d.incomeKind = k.ID
            LEFT JOIN tbl_Branch b ON d.incomBranchtxt = b.IDbranch
            ORDER BY i.incomeDate DESC
        `;
        const result = await sql.query(query);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في جلب الإيرادات', error: err.message });
    }
};

// جلب أنواع الإيرادات (مع المجموعة بتاعتها)
const getIncomeKinds = async (req, res) => {
    try {
        // ضيفنا kindGroup هنا 👇
        const result = await sql.query('SELECT ID, incomeKind, kindGroup FROM tbl_incomeKind ORDER BY kindGroup, incomeKind');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching kinds', error: err.message });
    }
};

// 3. إضافة إيصال جديد (تحصيل) 💰
const addIncome = async (req, res) => {
    const { 
        amount, 
        notes, 
        date, 
        user, 
        kindId,   // نوع الإيراد
        branchId, // الفرع
        childId,  // الطفل (مهم جداً)
        receiptNo // رقم الإيصال الورقي (اختياري)
    } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 1️⃣ تسجيل رأس الإيصال
        const requestHead = new sql.Request(transaction);
        requestHead.input('date', sql.DateTime, date || new Date());
        requestHead.input('user', sql.VarChar, user || 'AppUser');
        requestHead.input('byan', sql.VarChar, notes || 'تحصيل نقدية');

        const headResult = await requestHead.query(`
            INSERT INTO tbl_income (incomeDate, incomeByan, userAdd, Addtime, IncomeDone)
            OUTPUT inserted.ID
            VALUES (@date, @byan, @user, GETDATE(), 1)
        `);

        const newIncomeID = headResult.recordset[0].ID;

        // 2️⃣ تسجيل التفاصيل (وربطها بالطفل)
        const requestDetail = new sql.Request(transaction);
        requestDetail.input('incID', sql.Int, newIncomeID);
        requestDetail.input('amount', sql.Decimal(10, 2), amount);
        requestDetail.input('kind', sql.SmallInt, kindId);
        requestDetail.input('branch', sql.SmallInt, branchId);
        requestDetail.input('child', sql.Int, childId); // هنا الربط بالطفل
        requestDetail.input('receipt', sql.VarChar, receiptNo);
        requestDetail.input('notes', sql.VarChar, notes);

        await requestDetail.query(`
            INSERT INTO tbl_incomeDetalis 
            (IDincome, incomeAmount, incomeKind, incomBranchtxt, child_ID, ReceiptNumber, Notes)
            VALUES 
            (@incID, @amount, @kind, @branch, @child, @receipt, @notes)
        `);

        await transaction.commit();
        res.status(201).json({ message: 'تم تحصيل المبلغ بنجاح ✅', id: newIncomeID });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'فشلت عملية التحصيل', error: err.message });
    }
};

module.exports = {
    getAllIncomes,
    getIncomeKinds,
    addIncome
};