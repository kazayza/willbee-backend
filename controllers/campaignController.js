const { sql } = require('../config/db');

// 1. إضافة حملة إعلانية جديدة
const createCampaign = async (req, res) => {
    const { name, type, budget, startDate, endDate, description } = req.body;

    try {
        const request = new sql.Request();
        request.input('name', sql.NVarChar, name);
        request.input('type', sql.NVarChar, type); // Social Media, Print, Event...
        request.input('budget', sql.Decimal(10, 2), budget || 0);
        request.input('start', sql.DateTime, startDate || new Date());
        request.input('end', sql.DateTime, endDate);
        request.input('desc', sql.NVarChar, description);

        await request.query(`
            INSERT INTO tbl_Campaigns 
            (CampaignName, CampaignType, Budget, StartDate, EndDate, Description, Status, CreatedAt, IsDeleted)
            VALUES 
            (@name, @type, @budget, @start, @end, @desc, 'Active', GETDATE(), 0)
        `);

        res.status(201).json({ message: 'تم إنشاء الحملة بنجاح 📢' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. جلب الحملات النشطة (للـ Dropdown)
const getActiveCampaigns = async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT CampaignID, CampaignName, CampaignType 
            FROM tbl_Campaigns 
            WHERE Status = 'Active' AND IsDeleted = 0
            ORDER BY StartDate DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { createCampaign, getActiveCampaigns };