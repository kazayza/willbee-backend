const { sql } = require('../config/db');

// 1. إضافة جزاء أو مكافأة
const addPenalty = async (req, res) => {
    const { 
        empId, 
        amount, 
        date, 
        kind,
        notes, 
        user,
        localTime
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('emp', sql.Int, empId);
        request.input('amt', sql.Decimal(10, 2), amount);
        request.input('date', sql.DateTime, date || new Date());
        request.input('kind', sql.NVarChar, kind);
        request.input('notes', sql.NVarChar, notes);
        request.input('user', sql.NVarChar, user);
        request.input('addTime', sql.DateTime, localTime || new Date());

        await request.query(`
            INSERT INTO tbl_eshraf 
            (empolyeeID, amountPenalty, datePenalty, KindPenalty, notesPenalty, userAdd, Addtime, done, qestDone)
            VALUES 
            (@emp, @amt, @date, @kind, @notes, @user, @addTime, 0, 0)
        `);

        res.status(201).json({ message: 'تم التسجيل بنجاح ✅' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'فشل التسجيل', error: err.message });
    }
};

// 2. عرض سجل جزاءات موظف معين
const getEmployeePenalties = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);

        const result = await request.query(`
            SELECT ID, amountPenalty, KindPenalty, datePenalty, notesPenalty, done
            FROM tbl_eshraf 
            WHERE empolyeeID = @id 
            ORDER BY datePenalty DESC
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. بحث وفلترة سجل الجزاءات والمكافآت
const searchEshraf = async (req, res) => {
    const { empId, fromDate, toDate, kind } = req.query;

    try {
        const request = new sql.Request();
        
        let query = `
            SELECT 
                t.ID, 
                t.amountPenalty, 
                t.datePenalty, 
                t.KindPenalty, 
                t.notesPenalty, 
                t.userAdd, 
                t.Addtime,
                t.userEdit,
                t.editTime,
                e.ID as EmpID,
                e.empName, 
                e.job
            FROM tbl_eshraf t
            INNER JOIN tbl_empolyee e ON t.empolyeeID = e.ID
            WHERE 1=1
        `;

        if (empId) {
            request.input('empId', sql.Int, empId);
            query += ' AND t.empolyeeID = @empId';
        }

        if (fromDate) {
            request.input('fromDate', sql.Date, fromDate);
            query += ' AND t.datePenalty >= @fromDate';
        }
        if (toDate) {
            request.input('toDate', sql.Date, toDate);
            query += ' AND t.datePenalty <= @toDate';
        }

        if (kind) {
            request.input('kind', sql.NVarChar, kind);
            query += ' AND t.KindPenalty = @kind';
        }

        query += ' ORDER BY t.datePenalty DESC, t.Addtime DESC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error searching eshraf', error: err.message });
    }
};

// 4. حذف جزاء/مكافأة
const deletePenalty = async (req, res) => {
    const { id } = req.params;
    
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        
        const result = await request.query('DELETE FROM tbl_eshraf WHERE ID = @id');
        
        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'السجل غير موجود' });
        }
        
        res.status(200).json({ message: 'تم الحذف بنجاح 🗑️' });
    } catch (err) {
        console.error('Delete Error:', err);
        res.status(500).json({ message: 'فشل الحذف', error: err.message });
    }
};

// 5. تعديل جزاء/مكافأة
const updatePenalty = async (req, res) => {
    const { id } = req.params;
    const { amount, date, kind, notes, user, localTime } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('amt', sql.Decimal(10, 2), amount);
        request.input('date', sql.DateTime, date);
        request.input('kind', sql.NVarChar, kind);
        request.input('notes', sql.NVarChar, notes);
        request.input('user', sql.NVarChar, user);
        request.input('editTime', sql.DateTime, localTime || new Date());

        const result = await request.query(`
            UPDATE tbl_eshraf 
            SET 
                amountPenalty = @amt,
                datePenalty = @date,
                KindPenalty = @kind,
                notesPenalty = @notes,
                userEdit = @user,
                editTime = @editTime
            WHERE ID = @id
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'السجل غير موجود' });
        }

        res.status(200).json({ message: 'تم التعديل بنجاح ✏️' });
    } catch (err) {
        console.error('Update Error:', err);
        res.status(500).json({ message: 'فشل التعديل', error: err.message });
    }
};

// 🆕 6. تسجيل سلفة مع أقساطها
const addLoanWithInstallments = async (req, res) => {
    const { empId, loanAmount, loanDate, notes, user, installments,localTime } = req.body;

    // التحقق من البيانات
    if (!empId || !loanAmount || !installments || installments.length === 0) {
        return res.status(400).json({ message: 'بيانات ناقصة' });
    }

    // التحقق من إن إجمالي الأقساط = مبلغ السلفة
    const totalInstallments = installments.reduce((sum, inst) => sum + Number(inst.amount), 0);
    if (Math.abs(totalInstallments - loanAmount) > 0.01) {
        return res.status(400).json({ 
            message: `إجمالي الأقساط (${totalInstallments}) لا يساوي مبلغ السلفة (${loanAmount})` 
        });
    }

    const transaction = new sql.Transaction();
    
    try {
        await transaction.begin();

        // 1. تسجيل السلفة الأصلية
        const loanRequest = new sql.Request(transaction);
        loanRequest.input('emp', sql.Int, empId);
        loanRequest.input('amt', sql.Decimal(10, 2), loanAmount);
        loanRequest.input('date', sql.DateTime, loanDate || new Date());
        loanRequest.input('kind', sql.NVarChar, 'سلفه');
        loanRequest.input('notes', sql.NVarChar, notes || '');
        loanRequest.input('user', sql.NVarChar, user);
        loanRequest.input('addTime', sql.DateTime, localTime || new Date());

        await loanRequest.query(`
            INSERT INTO tbl_eshraf 
            (empolyeeID, amountPenalty, datePenalty, KindPenalty, notesPenalty, userAdd, Addtime, done, qestDone)
            VALUES 
            (@emp, @amt, @date, @kind, @notes, @user, @addTime, 0, 0)
        `);

        // 2. تسجيل الأقساط
        for (let i = 0; i < installments.length; i++) {
            const inst = installments[i];
            const instRequest = new sql.Request(transaction);
            instRequest.input('emp', sql.Int, empId);
            instRequest.input('amt', sql.Decimal(10, 2), inst.amount);
            instRequest.input('date', sql.DateTime, inst.date);
            instRequest.input('kind', sql.NVarChar, 'قسط سلفه');
            instRequest.input('notes', sql.NVarChar, `قسط ${i + 1} من ${installments.length}`);
            instRequest.input('user', sql.NVarChar, user);
            instRequest.input('addTime', sql.DateTime, localTime || new Date());

            await instRequest.query(`
                INSERT INTO tbl_eshraf 
                (empolyeeID, amountPenalty, datePenalty, KindPenalty, notesPenalty, userAdd, Addtime, done, qestDone)
                VALUES 
                (@emp, @amt, @date, @kind, @notes, @user, GETDATE(), 0, 0)
            `);
        }

        await transaction.commit();
        res.status(201).json({ 
            message: `تم تسجيل السلفة (${loanAmount} ج) مع ${installments.length} قسط بنجاح ✅` 
        });

    } catch (err) {
        await transaction.rollback();
        console.error('Loan Error:', err);
        res.status(500).json({ message: 'فشل تسجيل السلفة', error: err.message });
    }
};

// ✅ تصدير كل الدوال
module.exports = {
    addPenalty,
    getEmployeePenalties,
    searchEshraf,
    deletePenalty,
    updatePenalty,
    addLoanWithInstallments
};