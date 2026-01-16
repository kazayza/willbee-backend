const { sql } = require('../config/db');

// دالة لجلب الموظفين (مع ميزة البحث)
const getEmployees = async (req, res) => {
    // بناخد كلمة البحث من الرابط (لو موجودة)
    // مثال: ?search=أحمد
    const { search } = req.query;

    try {
        const request = new sql.Request();
        
        let query = 'SELECT ID, empName, job, mobile1, jobdate FROM tbl_empolyee';
        
        // لو المستخدم باعت كلمة بحث، بنزود شرط
        if (search) {
            request.input('searchTerm', sql.NVarChar, `%${search}%`); // الـ % عشان يبحث في الأول والآخر
            query += ' WHERE empName LIKE @searchTerm';
        }

        // ترتيب النتائج حسب الاسم
        query += ' ORDER BY empName ASC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في جلب البيانات', error: err.message });
    }
};

// دالة إضافة موظف جديد
const createEmployee = async (req, res) => {
    const { empName, mobile1, job, nationalID } = req.body;

    try {
        const request = new sql.Request();
        
        request.input('name', sql.NVarChar, empName);
        request.input('mobile', sql.VarChar, mobile1);
        request.input('job', sql.VarChar, job);
        request.input('nid', sql.Decimal(14,0), nationalID);

        await request.query(`
            INSERT INTO tbl_empolyee (empName, mobile1, job, nationalID, Addtime, empstatus)
            VALUES (@name, @mobile, @job, @nid, GETDATE(), 1)
        `);

        res.status(201).json({ message: 'تم تعيين الموظف بنجاح 👔' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'فشل الحفظ', error: err.message });
    }
};

module.exports = {
    getEmployees,
    createEmployee
};