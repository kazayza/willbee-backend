const { sql } = require('../config/db');

// تسجيل مكالمة أو زيارة
const addInteraction = async (req, res) => {
    const { customerId, type, subject, details, outcome } = req.body;

    try {
        const request = new sql.Request();
        request.input('cid', sql.Int, customerId);
        request.input('type', sql.NVarChar, type); // Call, Meeting, Email
        request.input('subj', sql.NVarChar, subject);
        request.input('det', sql.NVarChar, details);
        request.input('out', sql.NVarChar, outcome);

        await request.query(`
            INSERT INTO tbl_Interactions 
            (CustomerID, InteractionType, Subject, Details, Outcome, InteractionDate, CreatedAt)
            VALUES 
            (@cid, @type, @subj, @det, @out, GETDATE(), GETDATE())
        `);

        res.status(201).json({ message: 'تم تسجيل التفاعل بنجاح 📞' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// عرض سجل تفاعلات عميل
const getCustomerInteractions = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await sql.query(`SELECT * FROM tbl_Interactions WHERE CustomerID = ${id} ORDER BY InteractionDate DESC`);
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { addInteraction, getCustomerInteractions };