const { sql } = require('../config/db');

// 1. دالة لجلب كل الأطفال (موجودة من قبل)
const getAllChildren = async (req, res) => {
    try {
        const result = await sql.query`SELECT TOP 100 ID_Child, FullNameArabic, Age, Branch FROM tbl_Child`;
        // لاحظ: اخترنا أعمدة محددة عشان الـ List تكون خفيفة في التطبيق
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching children', error: err.message });
    }
};

// 2. دالة جديدة: جلب طفل واحد بالـ ID
const getChildById = async (req, res) => {
    const id = req.params.id; // بناخد الرقم من الرابط

    try {
        // بنجهز طلب جديد آمن (عشان نمنع الاختراق بـ SQL Injection)
        const request = new sql.Request();
        request.input('id', sql.Int, id); // بنعرفه إن ده رقم

        const result = await request.query('SELECT * FROM tbl_Child WHERE ID_Child = @id');

        if (result.recordset.length > 0) {
            res.status(200).json(result.recordset[0]); // رجع أول نتيجة
        } else {
            res.status(404).json({ message: 'Child not found' }); // لو مفيش طفل بالرقم ده
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error', error: err.message });
    }
};

// 3. دالة إضافة طفل جديد
const createNewChild = async (req, res) => {
    // البيانات اللي جاية من التطبيق
    const { FullNameArabic, NationalID, birthDate } = req.body;

    try {
        const request = new sql.Request();

        // بنربط البيانات بمتغيرات آمنة
        request.input('name', sql.NVarChar, FullNameArabic);
        request.input('nid', sql.Decimal(14, 0), NationalID); // لأن نوعه في الداتابيز Decimal
        request.input('bdate', sql.DateTime, birthDate);

        // تنفيذ عملية الإضافة
        await request.query(`
            INSERT INTO tbl_Child (FullNameArabic, NationalID, birthDate, Addtime)
            VALUES (@name, @nid, @bdate, GETDATE())
        `);

        res.status(201).json({ message: 'تم إضافة الطفل بنجاح! ✅' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'فشل الحفظ', error: err.message });
    }
};

// 4. دالة تعديل بيانات طفل (PUT)
const updateChild = async (req, res) => {
    const { id } = req.params; // بناخد الرقم من الرابط
    const { FullNameArabic, NationalID } = req.body; // البيانات الجديدة

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('name', sql.NVarChar, FullNameArabic);
        request.input('nid', sql.Decimal(14, 0), NationalID);

        // جملة التحديث
        const result = await request.query(`
            UPDATE tbl_Child 
            SET FullNameArabic = @name, NationalID = @nid, editTime = GETDATE()
            WHERE ID_Child = @id
        `);

        if (result.rowsAffected[0] > 0) {
            res.status(200).json({ message: 'تم تعديل البيانات بنجاح ✅' });
        } else {
            res.status(404).json({ message: 'لم يتم العثور على الطفل ❌' });
        }

    } catch (err) {
        res.status(500).json({ message: 'خطأ في التعديل', error: err.message });
    }
};

// 5. دالة حذف طفل (DELETE)
const deleteChild = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);

        const result = await request.query('DELETE FROM tbl_Child WHERE ID_Child = @id');

        if (result.rowsAffected[0] > 0) {
            res.status(200).json({ message: 'تم حذف الطفل بنجاح 🗑️' });
        } else {
            res.status(404).json({ message: 'الطفل غير موجود' });
        }

    } catch (err) {
        // ملاحظة: الحذف ممكن يفشل لو الطفل ليه مدفوعات مسجلة (Foreign Key)
        res.status(500).json({ message: 'لا يمكن حذف الطفل لارتباطه ببيانات أخرى', error: err.message });
    }
};

module.exports = {
    getAllChildren,
    getChildById,
    createNewChild,
    updateChild, // جديد
    deleteChild  // جديد
};