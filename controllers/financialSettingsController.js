const { sql } = require('../config/db');

// ============================================================
// 1️⃣ أنواع الإيرادات (Income Kinds)
// ============================================================

// جلب الأنواع (موجودة قبل كده بس هنحطها هنا للتنظيم)
const getIncomeKinds = async (req, res) => {
    try {
        const result = await sql.query('SELECT ID, incomeKind, kindGroup FROM tbl_incomeKind ORDER BY kindGroup, incomeKind');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// إضافة نوع إيراد
const addIncomeKind = async (req, res) => {
    const { name, group } = req.body;
    try {
        const request = new sql.Request();
        request.input('name', sql.NVarChar, name);
        request.input('group', sql.NVarChar, group);
        
        await request.query(`INSERT INTO tbl_incomeKind (incomeKind, kindGroup) VALUES (@name, @group)`);
        res.status(201).json({ message: 'تم إضافة نوع الإيراد بنجاح ✅' });
    } catch (err) {
        res.status(500).json({ message: 'فشل الإضافة', error: err.message });
    }
};

// تعديل نوع إيراد
const updateIncomeKind = async (req, res) => {
    const { id } = req.params;
    const { name, group } = req.body;
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('name', sql.NVarChar, name);
        request.input('group', sql.NVarChar, group);
        
        await request.query(`UPDATE tbl_incomeKind SET incomeKind = @name, kindGroup = @group WHERE ID = @id`);
        res.status(200).json({ message: 'تم التعديل بنجاح ✅' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// حذف نوع إيراد
const deleteIncomeKind = async (req, res) => {
    const { id } = req.params;
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        // لازم نتأكد إنه مش مستخدم قبل الحذف (اختياري بس آمن)
        await request.query(`DELETE FROM tbl_incomeKind WHERE ID = @id`);
        res.status(200).json({ message: 'تم الحذف بنجاح 🗑️' });
    } catch (err) {
        // لو فيه قيد (Foreign Key) هيضرب Error وده المطلوب
        if (err.number === 547) {
            return res.status(409).json({ message: 'لا يمكن حذف هذا النوع لأنه مستخدم في إيصالات سابقة ⚠️' });
        }
        res.status(500).json({ error: err.message });
    }
};


// ============================================================
// 2️⃣ أنواع المصروفات (Expense Kinds)
// ============================================================

const getExpenseKinds = async (req, res) => {
    try {
        // استبعاد رقم 8 (الرواتب) كما طلبت
        const result = await sql.query('SELECT ID, expenseKind, KindGroup FROM tbl_expenseKind WHERE ID <> 8 ORDER BY KindGroup, expenseKind');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const addExpenseKind = async (req, res) => {
    const { name, group } = req.body;
    try {
        const request = new sql.Request();
        request.input('name', sql.NVarChar, name);
        request.input('group', sql.NVarChar, group);
        
        await request.query(`INSERT INTO tbl_expenseKind (expenseKind, KindGroup) VALUES (@name, @group)`);
        res.status(201).json({ message: 'تم إضافة نوع المصروف بنجاح ✅' });
    } catch (err) {
        res.status(500).json({ message: 'فشل الإضافة', error: err.message });
    }
};

const updateExpenseKind = async (req, res) => {
    const { id } = req.params;
    const { name, group } = req.body;
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('name', sql.NVarChar, name);
        request.input('group', sql.NVarChar, group);
        
        await request.query(`UPDATE tbl_expenseKind SET expenseKind = @name, KindGroup = @group WHERE ID = @id`);
        res.status(200).json({ message: 'تم التعديل بنجاح ✅' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const deleteExpenseKind = async (req, res) => {
    const { id } = req.params;
    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        await request.query(`DELETE FROM tbl_expenseKind WHERE ID = @id`);
        res.status(200).json({ message: 'تم الحذف بنجاح 🗑️' });
    } catch (err) {
        if (err.number === 547) {
            return res.status(409).json({ message: 'لا يمكن حذف هذا النوع لأنه مستخدم في فواتير سابقة ⚠️' });
        }
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getIncomeKinds, addIncomeKind, updateIncomeKind, deleteIncomeKind,
    getExpenseKinds, addExpenseKind, updateExpenseKind, deleteExpenseKind
};