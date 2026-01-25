const { sql } = require('../config/db');

// 1. إضافة جزاء أو سلفة جديدة
const addPenalty = async (req, res) => {
    const { 
        empId, 
        amount, 
        date, 
        kind,   // نوع الخصم: 'غياب', 'تأخير', 'سلفة', 'إتلاف'
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

        // done = 0 (معناه لسه متخصمش من المرتب)
        // qestDone = 0 (لو سلفة، لسه متسددتش)
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

// 2. عرض سجل جزاءات موظف معين (عشان يظهر في بروفايله)
const getEmployeePenalties = async (req, res) => {
    const { id } = req.params; // Emp ID

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

// 3. بحث وفلترة سجل الجزاءات والمكافآت (لشاشة التقرير)
const searchEshraf = async (req, res) => {
    const { empId, fromDate, toDate, type, kind } = req.query;

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

        // 1. فلتر الموظف
        if (empId) {
            request.input('empId', sql.Int, empId);
            query += ' AND t.empolyeeID = @empId';
        }

        // 2. فلتر التاريخ (من - إلى)
        if (fromDate) {
            request.input('fromDate', sql.Date, fromDate);
            query += ' AND t.datePenalty >= @fromDate';
        }
        if (toDate) {
            request.input('toDate', sql.Date, toDate);
            query += ' AND t.datePenalty <= @toDate';
        }

        // 3. فلتر النوع المحدد (غياب، مكافأة، إلخ)
        if (kind) {
            request.input('kind', sql.NVarChar, kind);
            query += ' AND t.KindPenalty = @kind';
        }

        // ترتيب تنازلي بالتاريخ (الأحدث أولاً)
        query += ' ORDER BY t.datePenalty DESC, t.Addtime DESC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error searching eshraf', error: err.message });
    }
};

module.exports = {
    addPenalty,
    getEmployeePenalties,
    searchEshraf 
};
