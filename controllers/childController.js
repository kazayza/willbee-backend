const { sql } = require('../config/db');

// 1. دالة لجلب كل الأطفال (موجودة من قبل)
const getAllChildren = async (req, res) => {
    try {
        const result = await sql.query`SELECT ID_Child, FullNameArabic, Age, Branch FROM tbl_Child`;
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
// 3. إضافة طفل جديد (تحديث شامل)
const createNewChild = async (req, res) => {
    const { 
        FullNameArabic, FullNameEnglish, NationalID, birthDate, Branch,
        FatherName, FatherMobile1, MotherName, MotherMobile1, ResidenceAddress,
        EmergencyName1, EmergencyNumber1, Notes, Allergies,
        DidFullTime, DoSports, WearDiapers, userAdd
    } = req.body;

    try {
        const request = new sql.Request();

        // ربط المتغيرات
        request.input('nameAr', sql.NVarChar, FullNameArabic);
        request.input('nameEn', sql.NVarChar, FullNameEnglish);
        request.input('nid', sql.Decimal(14, 0), NationalID);
        request.input('bdate', sql.DateTime, birthDate);
        request.input('branch', sql.SmallInt, Branch);
        request.input('status', sql.Bit, 1); // Active by default
        
        request.input('fName', sql.VarChar, FatherName);
        request.input('fMob', sql.VarChar, FatherMobile1);
        request.input('mName', sql.VarChar, MotherName);
        request.input('mMob', sql.VarChar, MotherMobile1);
        request.input('addr', sql.VarChar, ResidenceAddress);
        
        request.input('eName', sql.VarChar, EmergencyName1);
        request.input('eMob', sql.VarChar, EmergencyNumber1);
        request.input('notes', sql.VarChar, Notes);
        request.input('allergies', sql.VarChar, Allergies);
        
        request.input('fullTime', sql.Bit, DidFullTime);
        request.input('sports', sql.Bit, DoSports);
        request.input('diapers', sql.Bit, WearDiapers);
        request.input('user', sql.VarChar, userAdd);

        // جملة الاستعلام العملاقة
        await request.query(`
            INSERT INTO tbl_Child 
            (FullNameArabic, FullNameEnglish, NationalID, birthDate, Branch, Status,
             FatherName, FatherMobile1, MotherName, MotherMobile1, ResidenceAddress,
             EmergencyName1, EmergencyNumber1, Notes, Allergies,
             DidFullTime, DoSports, WearDiapers, userAdd, Addtime)
            VALUES 
            (@nameAr, @nameEn, @nid, @bdate, @branch, @status,
             @fName, @fMob, @mName, @mMob, @addr,
             @eName, @eMob, @notes, @allergies,
             @fullTime, @sports, @diapers, @user, GETDATE())
        `);

        res.status(201).json({ message: 'تم حفظ ملف الطفل كاملاً بنجاح ✅' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'فشل الحفظ', error: err.message });
    }
};

// 4. دالة تعديل بيانات طفل (PUT)
// 4. تعديل بيانات طفل (تحديث شامل)
const updateChild = async (req, res) => {
    const { id } = req.params;
    const { 
        FullNameArabic, FullNameEnglish, NationalID, birthDate, Branch,
        FatherName, FatherMobile1, MotherName, MotherMobile1, ResidenceAddress,
        EmergencyName1, EmergencyNumber1, Notes, Allergies,
        DidFullTime, DoSports, WearDiapers, userEdit // اسم المستخدم اللي عدل
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        
        request.input('nameAr', sql.NVarChar, FullNameArabic);
        request.input('nameEn', sql.NVarChar, FullNameEnglish);
        request.input('nid', sql.Decimal(14, 0), NationalID);
        request.input('bdate', sql.DateTime, birthDate);
        request.input('branch', sql.SmallInt, Branch);
        
        request.input('fName', sql.VarChar, FatherName);
        request.input('fMob', sql.VarChar, FatherMobile1);
        request.input('mName', sql.VarChar, MotherName);
        request.input('mMob', sql.VarChar, MotherMobile1);
        request.input('addr', sql.VarChar, ResidenceAddress);
        
        request.input('eName', sql.VarChar, EmergencyName1);
        request.input('eMob', sql.VarChar, EmergencyNumber1);
        request.input('notes', sql.VarChar, Notes);
        request.input('allergies', sql.VarChar, Allergies);
        
        request.input('fullTime', sql.Bit, DidFullTime);
        request.input('sports', sql.Bit, DoSports);
        request.input('diapers', sql.Bit, WearDiapers);
        request.input('user', sql.VarChar, userEdit);

        await request.query(`
            UPDATE tbl_Child 
            SET 
                FullNameArabic = @nameAr,
                FullNameEnglish = @nameEn,
                NationalID = @nid,
                birthDate = @bdate,
                Branch = @branch,
                FatherName = @fName,
                FatherMobile1 = @fMob,
                MotherName = @mName,
                MotherMobile1 = @mMob,
                ResidenceAddress = @addr,
                EmergencyName1 = @eName,
                EmergencyNumber1 = @eMob,
                Notes = @notes,
                Allergies = @allergies,
                DidFullTime = @fullTime,
                DoSports = @sports,
                WearDiapers = @diapers,
                useredit = @user,
                editTime = GETDATE()
            WHERE ID_Child = @id
        `);

        res.status(200).json({ message: 'تم تعديل بيانات الطفل بنجاح ✅' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'فشل التعديل', error: err.message });
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