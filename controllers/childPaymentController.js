const { sql } = require('../config/db');

// ═══════════════════════════════════════════════════════════════
// 1. إنشاء أقساط جديدة لاشتراك معين
// ═══════════════════════════════════════════════════════════════
const createInstallments = async (req, res) => {
    const { 
        financeId,      // ID من tbl_FinanceChild
        installments,   // مصفوفة الأقساط [{amount, date}, ...]
        userAdd,        // مين ضاف (من الموبايل)
        addTime         // توقيت مصر (من الموبايل)
    } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        for (const inst of installments) {
            const request = new sql.Request(transaction);
            request.input('paymentId', sql.Int, financeId);
            request.input('amount', sql.Decimal(5, 0), inst.amount);
            request.input('monthDate', sql.DateTime, inst.date);
            request.input('userAdd', sql.VarChar, userAdd);
            request.input('addTime', sql.DateTime, addTime);

            await request.query(`
                INSERT INTO tbl_PaymentsChild 
                (PaymentID, MonthPayment, amountPyment, userAdd, Addtime, PaymentDone)
                VALUES 
                (@paymentId, @monthDate, @amount, @userAdd, @addTime, 0)
            `);
        }

        await transaction.commit();
        res.status(201).json({ 
            message: 'تم إنشاء الأقساط بنجاح ✅',
            count: installments.length 
        });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'فشل إنشاء الأقساط', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 2. جلب أقساط اشتراك معين
// ═══════════════════════════════════════════════════════════════
const getInstallmentsByFinanceId = async (req, res) => {
    const { financeId } = req.params;

    try {
        const request = new sql.Request();
        request.input('financeId', sql.Int, financeId);

        const result = await request.query(`
            SELECT 
                ID,
                PaymentID,
                MonthPayment,
                amountPyment,
                PaymentDone,
                PaymentNotes,
                userAdd,
                Addtime,
                useredit,
                editTime
            FROM tbl_PaymentsChild 
            WHERE PaymentID = @financeId
            ORDER BY MonthPayment ASC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في جلب الأقساط', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 3. تعديل قسط معين
// ═══════════════════════════════════════════════════════════════
const updateInstallment = async (req, res) => {
    const { id } = req.params;
    const { 
        amount, 
        date, 
        notes,
        useredit,       // مين عدل (من الموبايل)
        editTime        // توقيت مصر (من الموبايل)
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('amount', sql.Decimal(5, 0), amount);
        request.input('date', sql.DateTime, date);
        request.input('notes', sql.VarChar, notes);
        request.input('useredit', sql.VarChar, useredit);
        request.input('editTime', sql.DateTime, editTime);

        const result = await request.query(`
            UPDATE tbl_PaymentsChild 
            SET 
                amountPyment = @amount,
                MonthPayment = @date,
                PaymentNotes = @notes,
                useredit = @useredit,
                editTime = @editTime
            WHERE ID = @id
        `);

        if (result.rowsAffected[0] > 0) {
            res.status(200).json({ message: 'تم تعديل القسط بنجاح ✅' });
        } else {
            res.status(404).json({ message: 'القسط غير موجود' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'فشل تعديل القسط', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 4. حذف قسط معين
// ═══════════════════════════════════════════════════════════════
const deleteInstallment = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);

        const result = await request.query(`
            DELETE FROM tbl_PaymentsChild WHERE ID = @id
        `);

        if (result.rowsAffected[0] > 0) {
            res.status(200).json({ message: 'تم حذف القسط بنجاح 🗑️' });
        } else {
            res.status(404).json({ message: 'القسط غير موجود' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'فشل حذف القسط', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 5. حذف كل أقساط اشتراك معين
// ═══════════════════════════════════════════════════════════════
const deleteAllInstallments = async (req, res) => {
    const { financeId } = req.params;

    try {
        const request = new sql.Request();
        request.input('financeId', sql.Int, financeId);

        const result = await request.query(`
            DELETE FROM tbl_PaymentsChild WHERE PaymentID = @financeId
        `);

        res.status(200).json({ 
            message: 'تم حذف كل الأقساط بنجاح 🗑️',
            count: result.rowsAffected[0]
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'فشل حذف الأقساط', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 6. تسجيل دفع قسط (تحديث حالة القسط لـ "مدفوع")
// ═══════════════════════════════════════════════════════════════
const payInstallment = async (req, res) => {
    const { id } = req.params;
    const { 
        notes, 
        useredit,       // مين عدل (من الموبايل)
        editTime        // توقيت مصر (من الموبايل)
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('notes', sql.VarChar, notes);
        request.input('useredit', sql.VarChar, useredit);
        request.input('editTime', sql.DateTime, editTime);

        const result = await request.query(`
            UPDATE tbl_PaymentsChild 
            SET 
                PaymentDone = 1,
                PaymentNotes = @notes,
                useredit = @useredit,
                editTime = @editTime
            WHERE ID = @id
        `);

        if (result.rowsAffected[0] > 0) {
            res.status(200).json({ message: 'تم تسجيل الدفع بنجاح 💵' });
        } else {
            res.status(404).json({ message: 'القسط غير موجود' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'فشل تسجيل الدفع', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 7. جلب آخر المدفوعات
// ═══════════════════════════════════════════════════════════════
const getRecentPayments = async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT TOP 50 
                p.*,
                f.Child_Id,
                c.FullNameArabic as ChildName
            FROM tbl_PaymentsChild p
            LEFT JOIN tbl_FinanceChild f ON p.PaymentID = f.ID
            LEFT JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            ORDER BY p.Addtime DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { 
    createInstallments,
    getInstallmentsByFinanceId,
    updateInstallment,
    deleteInstallment,
    deleteAllInstallments,
    payInstallment, 
    getRecentPayments 
};