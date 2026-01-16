const { sql } = require('../config/db');

// 1. عرض سجل المراقبة (Audit Log) - للمدير فقط
const getAuditLogs = async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT TOP 100 * FROM tbl_AuditLog 
            ORDER BY Timestamp DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. تسجيل حركة يدوية (Log Action) - بنناديها من الفرونت
const logAction = async (req, res) => {
    const { userId, action, table, recordId, details } = req.body;

    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, userId);
        request.input('act', sql.NVarChar, action); // Create, Update, Delete
        request.input('tbl', sql.NVarChar, table);
        request.input('rec', sql.Int, recordId);
        request.input('det', sql.NVarChar, details); // New Values

        await request.query(`
            INSERT INTO tbl_AuditLog (UserID, ActionType, TableName, RecordID, NewValues, Timestamp)
            VALUES (@uid, @act, @tbl, @rec, @det, GETDATE())
        `);
        res.status(201).json({ message: 'Logged' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. جلب أسماء الشاشات (Forms) - عشان شاشة الصلاحيات
const getFormNames = async (req, res) => {
    try {
        const result = await sql.query('SELECT * FROM tbl_FormName ORDER BY seq ASC');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getAuditLogs, logAction, getFormNames };