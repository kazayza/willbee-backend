const { sql } = require('../config/db');

// 1. تسجيل دفع قسط جديد
const payInstallment = async (req, res) => {
    const { 
        paymentId,    // اختياري (لو بتربط برقم إيصال معين)
        amount,       // المبلغ المدفوع
        monthDate,    // شهر القسط (مثلاً 1-1-2025)
        notes, 
        user 
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('payID', sql.Int, paymentId || 0);
        request.input('amt', sql.Decimal(5, 0), amount);
        request.input('mDate', sql.DateTime, monthDate);
        request.input('notes', sql.VarChar, notes);
        request.input('user', sql.VarChar, user);

        await request.query(`
            INSERT INTO tbl_PaymentsChild 
            (PaymentID, MonthPayment, amountPyment, userAdd, Addtime, PaymentNotes, PaymentDone)
            VALUES 
            (@payID, @mDate, @amt, @user, GETDATE(), @notes, 1)
        `);

        res.status(201).json({ message: 'تم تسجيل دفع القسط بنجاح 💵' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. عرض سجل مدفوعات طفل (أو إيصال معين)
// ملاحظة: الجدول ده مفيهوش ChildID مباشر، غالباً الربط بيتم عن طريق PaymentID أو إن الجدول ده لتفاصيل قسط معين
// لكن بناءً على الهيكلة، هنفترض إننا بنعرض المدفوعات المسجلة حديثاً
const getRecentPayments = async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT TOP 50 * FROM tbl_PaymentsChild ORDER BY Addtime DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { payInstallment, getRecentPayments };