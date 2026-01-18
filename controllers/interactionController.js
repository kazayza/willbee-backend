const { sql } = require('../config/db');

// 1. تسجيل مكالمة / زيارة / تواصل جديد لعميل فعلي
const addInteraction = async (req, res) => {
    const { customerId, type, subject, details, outcome } = req.body;

    if (!customerId || !type || !subject) {
        return res.status(400).json({ message: 'customerId, type, subject مطلوبة' });
    }

    try {
        const request = new sql.Request();
        request.input('cid', sql.Int, customerId);
        request.input('type', sql.NVarChar, type);      // Call, Visit, WhatsApp, Email...
        request.input('subj', sql.NVarChar, subject);
        request.input('det', sql.NVarChar, details || null);
        request.input('out', sql.NVarChar, outcome || null);

        await request.query(`
            INSERT INTO tbl_Interactions 
            (CustomerID, InteractionType, Subject, Details, Outcome, InteractionDate)
            VALUES 
            (@cid, @type, @subj, @det, @out, GETDATE())
        `);

        res.status(201).json({ message: 'تم تسجيل التفاعل بنجاح ✅' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// 2. عرض سجل تفاعلات عميل
const getCustomerInteractions = async (req, res) => {
    const { id } = req.params; // CustomerID

    try {
        const request = new sql.Request();
        request.input('cid', sql.Int, id);

        const result = await request.query(`
            SELECT 
                InteractionID,
                InteractionType,
                Subject,
                Details,
                Outcome,
                InteractionDate
            FROM tbl_Interactions
            WHERE CustomerID = @cid AND IsDeleted = 0
            ORDER BY InteractionDate DESC
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { 
    addInteraction, 
    getCustomerInteractions 
};