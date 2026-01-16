// Fixed missing functions update
const { sql } = require('../config/db');

// 1. جلب السنوات المالية
const getSessions = async (req, res) => {
    try {
        const result = await sql.query('SELECT IDSession, Sessions FROM tbl_Sessions ORDER BY IDSession DESC');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. جلب الإدارات
const getManagements = async (req, res) => {
    try {
        const result = await sql.query('SELECT managementID, ManagmentName FROM tbl_Managment');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. جلب أنواع العمالة
const getWorkerTypes = async (req, res) => {
    try {
        const result = await sql.query('SELECT ID, workdescription FROM tbl_empworker');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. قائمة أنواع الجزاءات (كانت ناقصة وهي سبب الخطأ)
const getPenaltyTypes = (req, res) => {
    const types = [
        { id: 'غياب', name: 'غياب' },
        { id: 'تأخير', name: 'تأخير' },
        { id: 'سلفة', name: 'سلفة' },
        { id: 'إتلاف', name: 'إتلاف عهده' },
        { id: 'إداري', name: 'جزاء إداري' }
    ];
    res.status(200).json(types);
};

// 5. قائمة أنواع الإشراف (خصومات وإضافات)
const getEshrafTypes = (req, res) => {
    const types = [
        // 🔴 الخصومات
        { id: 'غياب', name: 'غياب', type: 'deduction', factor: -1 },
        { id: 'تأخير', name: 'تأخير', type: 'deduction', factor: -1 },
        { id: 'سلفة', name: 'سلفة', type: 'deduction', factor: -1 },
        { id: 'جزاء', name: 'جزاء إداري/إتلاف', type: 'deduction', factor: -1 },
        // 🟢 الإضافات
        { id: 'مكافأة', name: 'مكافأة', type: 'addition', factor: 1 },
        { id: 'بدل', name: 'بدل (انتقال/وجبة)', type: 'addition', factor: 1 },
        { id: 'حافز', name: 'حافز إضافي', type: 'addition', factor: 1 },
        { id: 'إضافي', name: 'عمل إضافي (Overtime)', type: 'addition', factor: 1 }
    ];
    res.status(200).json(types);
};

// 6. جلب الوظائف (للأب والأم)
const getProfessions = async (req, res) => {
    try {
        const result = await sql.query('SELECT ID, profession FROM tbl_profession');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 7. جلب بيانات الحضانة (للطباعة)
const getCompanyInfo = async (req, res) => {
    try {
        const result = await sql.query('SELECT * FROM tbl_company');
        res.status(200).json(result.recordset.length > 0 ? result.recordset[0] : {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getSessions,
    getManagements,
    getWorkerTypes,
    getPenaltyTypes,
    getEshrafTypes,
    getProfessions,
    getCompanyInfo
};