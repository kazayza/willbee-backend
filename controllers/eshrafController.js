const { sql } = require('../config/db');

// 1. إضافة جزاء أو سلفة جديدة
const addPenalty = async (req, res) => {
    const { 
        empId, 
        amount, 
        date, 
        kind,
        notes, 
        user 
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('emp', sql.Int, empId);
        request.input('amt', sql.Decimal(7, 2), amount);
        request.input('date', sql.DateTime, date || new Date());
        request.input('kind', sql.VarChar, kind);
        request.input('notes', sql.VarChar, notes);
        request.input('user', sql.VarChar, user);

        await request.query(`
            INSERT INTO tbl_eshraf 
            (empolyeeID, amountPenalty, datePenalty, KindPenalty, notesPenalty, userAdd, Addtime, done, qestDone)
            VALUES 
            (@emp, @amt, @date, @kind, @notes, @user, GETDATE(), 0, 0)
        `);

        res.status(201).json({ message: 'تم تسجيل الجزاء/السلفة بنجاح 📉' });

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

// ✅ 4. حذف جزاء/مكافأة (جديدة)
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

// ✅ 5. تعديل جزاء/مكافأة (جديدة)
const updatePenalty = async (req, res) => {
    const { id } = req.params;
    const { amount, date, kind, notes, user } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('amt', sql.Decimal(7, 2), amount);
        request.input('date', sql.DateTime, date);
        request.input('kind', sql.VarChar, kind);
        request.input('notes', sql.VarChar, notes);
        request.input('user', sql.VarChar, user);

        const result = await request.query(`
            UPDATE tbl_eshraf 
            SET 
                amountPenalty = @amt,
                datePenalty = @date,
                KindPenalty = @kind,
                notesPenalty = @notes,
                userEdit = @user,
                editTime = GETDATE()
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

// ✅ تصدير كل الدوال
module.exports = {
    addPenalty,
    getEmployeePenalties,
    searchEshraf,
    deletePenalty,
    updatePenalty
};