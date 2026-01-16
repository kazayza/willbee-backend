const { sql } = require('../config/db');

// جلب السنوات المالية
const getSessions = async (req, res) => {
    try {
        const result = await sql.query('SELECT IDSession, Sessions FROM tbl_Sessions ORDER BY IDSession DESC');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// جلب الإدارات
const getManagements = async (req, res) => {
    try {
        const result = await sql.query('SELECT managementID, ManagmentName FROM tbl_Managment');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// جلب أنواع العمالة
const getWorkerTypes = async (req, res) => {
    try {
        const result = await sql.query('SELECT ID, workdescription FROM tbl_empworker');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// قائمة أنواع الإشراف (خصومات وإضافات)
const getEshrafTypes = (req, res) => {
    const types = [
        // 🔴 الخصومات (Deductions)
        { id: 'غياب', name: 'غياب', type: 'deduction', factor: -1 },
        { id: 'تأخير', name: 'تأخير', type: 'deduction', factor: -1 },
        { id: 'سلفة', name: 'سلفة', type: 'deduction', factor: -1 },
        { id: 'جزاء', name: 'جزاء إداري/إتلاف', type: 'deduction', factor: -1 },
        
        // 🟢 الإضافات (Additions)
        { id: 'مكافأة', name: 'مكافأة', type: 'addition', factor: 1 },
        { id: 'بدل', name: 'بدل (انتقال/وجبة)', type: 'addition', factor: 1 },
        { id: 'حافز', name: 'حافز إضافي', type: 'addition', factor: 1 },
        { id: 'إضافي', name: 'عمل إضافي (Overtime)', type: 'addition', factor: 1 }
    ];
    res.status(200).json(types);
};

module.exports = {
    getSessions,
    getManagements,
    getWorkerTypes,
    getEshrafTypes 
};