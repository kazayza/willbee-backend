const { sql } = require('../config/db');

// حفظ إعدادات تقرير جديد
const saveReportConfig = async (req, res) => {
    const { name, type, description, params, user } = req.body;
    // params: بنخزن فيه الفلاتر كـ JSON String (مثلاً: "{branch: 1, status: active}")

    try {
        const request = new sql.Request();
        request.input('name', sql.NVarChar, name);
        request.input('type', sql.NVarChar, type);
        request.input('desc', sql.NVarChar, description);
        request.input('params', sql.NVarChar, params); // JSON String
        request.input('user', sql.Int, user); // UserID

        await request.query(`
            INSERT INTO tbl_SavedReports 
            (ReportName, ReportType, Description, Parameters, CreatedBy, IsPublic, CreatedAt, IsDeleted)
            VALUES 
            (@name, @type, @desc, @params, @user, 0, GETDATE(), 0)
        `);

        res.status(201).json({ message: 'تم حفظ إعدادات التقرير 📊' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// جلب التقارير المحفوظة
const getSavedReports = async (req, res) => {
    try {
        const result = await sql.query('SELECT * FROM tbl_SavedReports WHERE IsDeleted = 0 ORDER BY CreatedAt DESC');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { saveReportConfig, getSavedReports };