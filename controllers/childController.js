const { sql } = require('../config/db');

// 1. دالة لجلب كل الأطفال (موجودة من قبل)
// 1. جلب كل الأطفال (مع Addtime و Status)
// 1. جلب كل الأطفال (مع فلترة السنة المالية)
//1. تعديل لاضافة الفصول
const getAllChildren = async (req, res) => {
    const { sessionId } = req.query; 

    try {
        let query = '';
        
        if (sessionId) {
            // الحالة الأولى: لو فيه فلتر بالسنة المالية
            // بنجيب الأطفال المشتركين في السنة دي + بيانات فصلهم الحالي + اسم الفرع
            query = `
                SELECT DISTINCT
                    c.ID_Child, 
                    c.FullNameArabic, 
                    c.NationalID,
                    -- بنحسب العمر أوتوماتيك بدقة
                    FLOOR(DATEDIFF(DAY, c.birthDate, GETDATE()) / 365.25) AS CalculatedAge,
                    c.Branch,       -- رقم الفرع (للكود)
                    b.branchName,   -- اسم الفرع (للعرض)
                    c.Status,
                    c.Addtime,
                    v.ClassName,    -- اسم الفصل (A, B, C...)
                    v.Class_ID      -- رقم الفصل (المميز)
                FROM tbl_Child c
                INNER JOIN tbl_FinanceChild f ON c.ID_Child = f.Child_Id
                LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
                LEFT JOIN vw_ChildrenCurrentClass v ON c.ID_Child = v.ID_Child
                WHERE f.SessionID = ${sessionId}
                ORDER BY c.ID_Child DESC
            `;
        } else {
            // الحالة الثانية: لو مفيش فلتر (كل الأطفال)
            query = `
                SELECT 
                    c.ID_Child, 
                    c.FullNameArabic, 
                    c.NationalID,
                    -- بنحسب العمر أوتوماتيك بدقة
                    FLOOR(DATEDIFF(DAY, c.birthDate, GETDATE()) / 365.25) AS CalculatedAge,
                    c.Branch,       -- رقم الفرع
                    b.branchName,   -- اسم الفرع
                    c.Status,
                    c.Addtime,
                    v.ClassName,    -- اسم الفصل
                    v.Class_ID      -- رقم الفصل
                FROM tbl_Child c
                LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
                LEFT JOIN vw_ChildrenCurrentClass v ON c.ID_Child = v.ID_Child
                ORDER BY c.ID_Child DESC
            `;
        }

        const result = await sql.query(query);
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

        const result = await request.query(`
    SELECT 
        c.*,
        b.branchName,
        v.ClassName,
        v.Class_ID
    FROM tbl_Child c
    LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
    LEFT JOIN vw_ChildrenCurrentClass v ON c.ID_Child = v.ID_Child
    WHERE c.ID_Child = @id
`);

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
// 3. إضافة طفل جديد (مع حساب العمر + منع تكرار الرقم القومي)
const createNewChild = async (req, res) => {
    const { 
        FullNameArabic, FullNameEnglish, NationalID, birthDate, Branch,
        FatherName, FatherMobile1, MotherName, MotherMobile1, ResidenceAddress,
        EmergencyName1, EmergencyNumber1, Notes, Allergies,
        DidFullTime, DoSports, WearDiapers, userAdd
    } = req.body;

    try {
        const request = new sql.Request();
        
        // ============================================
        // 1️⃣ الخطوة الجديدة: التحقق من الرقم القومي
        // ============================================
        request.input('checkNid', sql.Decimal(14, 0), NationalID);
        
        const checkResult = await request.query(`
            SELECT ID_Child, FullNameArabic 
            FROM tbl_Child 
            WHERE NationalID = @checkNid
        `);

        // لو لقينا نتيجة، نوقف فوراً ونرجع رسالة خطأ
        if (checkResult.recordset.length > 0) {
            return res.status(409).json({ 
                message: 'عفواً، هذا الرقم القومي مسجل مسبقاً لطفل آخر ⚠️',
                existingChild: checkResult.recordset[0].FullNameArabic // بنرجع اسم الطفل الموجود عشان التوضيح
            });
        }

        // ============================================
        // 2️⃣ حساب العمر (زي ما اتفقنا)
        // ============================================
        const birthDateObj = new Date(birthDate);
        const today = new Date();
        let calculatedAge = today.getFullYear() - birthDateObj.getFullYear();
        const m = today.getMonth() - birthDateObj.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDateObj.getDate())) {
            calculatedAge--;
        }
        calculatedAge = calculatedAge < 0 ? 0 : calculatedAge;

        // ============================================
        // 3️⃣ عملية الحفظ (Insert)
        // ============================================
        
        // تعريف باقي المتغيرات
        request.input('nameAr', sql.NVarChar, FullNameArabic);
        request.input('nameEn', sql.NVarChar, FullNameEnglish);
        request.input('nid', sql.Decimal(14, 0), NationalID);
        request.input('bdate', sql.DateTime, birthDate);
        request.input('age', sql.SmallInt, calculatedAge);
        request.input('branch', sql.SmallInt, Branch);
        request.input('status', sql.Bit, 1); 
        
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

        await request.query(`
            INSERT INTO tbl_Child 
            (FullNameArabic, FullNameEnglish, NationalID, birthDate, Age, Branch, Status,
             FatherName, FatherMobile1, MotherName, MotherMobile1, ResidenceAddress,
             EmergencyName1, EmergencyNumber1, Notes, Allergies,
             DidFullTime, DoSports, WearDiapers, userAdd, Addtime)
            VALUES 
            (@nameAr, @nameEn, @nid, @bdate, @age, @branch, @status,
             @fName, @fMob, @mName, @mMob, @addr,
             @eName, @eMob, @notes, @allergies,
             @fullTime, @sports, @diapers, @user, SYSDATETIMEOFFSET() AT TIME ZONE 'Egypt Standard Time')
        `);

        res.status(201).json({ message: 'تم حفظ ملف الطفل الجديد بنجاح ✅' });

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
                editTime = SYSDATETIMEOFFSET() AT TIME ZONE 'Egypt Standard Time'
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
// ✅ جلب أعياد ميلاد اليوم
const getTodayBirthdays = async (req, res) => {
    try {
        const request = new sql.Request();

        const result = await request.query(`
            SELECT 
                c.ID_Child,
                c.FullNameArabic AS childName,
                c.birthDate,
                FLOOR(DATEDIFF(DAY, c.birthDate, GETDATE()) / 365.25) AS age,
                b.branchName,
                v.ClassName
            FROM tbl_Child c
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            LEFT JOIN vw_ChildrenCurrentClass v ON c.ID_Child = v.ID_Child
            WHERE 
                c.Status = 1
                AND DAY(c.birthDate) = DAY(GETDATE())
                AND MONTH(c.birthDate) = MONTH(GETDATE())
            ORDER BY c.FullNameArabic ASC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('getTodayBirthdays error:', err);
        res.status(500).json({ 
            message: 'Error fetching birthdays', 
            error: err.message 
        });
    }
};
// ✅ جلب أعياد ميلاد الأسبوع القادم
const getUpcomingBirthdays = async (req, res) => {
    try {
        const request = new sql.Request();

        const result = await request.query(`
            SELECT 
                c.ID_Child,
                c.FullNameArabic AS childName,
                c.birthDate,
                FLOOR(DATEDIFF(DAY, c.birthDate, GETDATE()) / 365.25) AS age,
                c.FatherMobile1,
                c.MotherMobile1,
                b.branchName,
                v.ClassName,
                CASE 
                    WHEN MONTH(c.birthDate) = MONTH(GETDATE()) 
                         AND DAY(c.birthDate) = DAY(GETDATE())
                    THEN 0
                    WHEN MONTH(c.birthDate) > MONTH(GETDATE()) 
                         OR (MONTH(c.birthDate) = MONTH(GETDATE()) AND DAY(c.birthDate) > DAY(GETDATE()))
                    THEN DATEDIFF(DAY, GETDATE(), 
                         DATEFROMPARTS(YEAR(GETDATE()), MONTH(c.birthDate), DAY(c.birthDate)))
                    ELSE DATEDIFF(DAY, GETDATE(), 
                         DATEFROMPARTS(YEAR(GETDATE()) + 1, MONTH(c.birthDate), DAY(c.birthDate)))
                END AS daysUntilBirthday
            FROM tbl_Child c
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            LEFT JOIN vw_ChildrenCurrentClass v ON c.ID_Child = v.ID_Child
            WHERE 
                c.Status = 1
                AND (
                    (MONTH(c.birthDate) = MONTH(GETDATE()) AND DAY(c.birthDate) >= DAY(GETDATE()))
                    OR
                    (MONTH(c.birthDate) = MONTH(DATEADD(DAY, 7, GETDATE())) 
                     AND DAY(c.birthDate) <= DAY(DATEADD(DAY, 7, GETDATE())))
                )
            ORDER BY 
                CASE 
                    WHEN MONTH(c.birthDate) > MONTH(GETDATE()) 
                         OR (MONTH(c.birthDate) = MONTH(GETDATE()) AND DAY(c.birthDate) >= DAY(GETDATE()))
                    THEN DATEDIFF(DAY, GETDATE(), 
                         DATEFROMPARTS(YEAR(GETDATE()), MONTH(c.birthDate), DAY(c.birthDate)))
                    ELSE DATEDIFF(DAY, GETDATE(), 
                         DATEFROMPARTS(YEAR(GETDATE()) + 1, MONTH(c.birthDate), DAY(c.birthDate)))
                END ASC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('getUpcomingBirthdays error:', err);
        res.status(500).json({ message: 'Error fetching upcoming birthdays', error: err.message });
    }
};
// ✅ إرسال إشعارات أعياد الميلاد (للـ Cron Job)
const sendBirthdayReminders = async (req, res) => {
    const { createAndPushToAll } = require('./notificationController');

    try {
        const request = new sql.Request();

        // جلب أعياد ميلاد اليوم
        const result = await request.query(`
            SELECT 
                c.ID_Child,
                c.FullNameArabic AS childName,
                c.birthDate,
                c.FatherMobile1,
                c.MotherMobile1,
                FLOOR(DATEDIFF(DAY, c.birthDate, GETDATE()) / 365.25) AS age,
                b.branchName
            FROM tbl_Child c
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            WHERE 
                c.Status = 1
                AND DAY(c.birthDate) = DAY(GETDATE())
                AND MONTH(c.birthDate) = MONTH(GETDATE())
        `);

        if (result.recordset.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'لا توجد أعياد ميلاد اليوم',
                sent: 0
            });
        }

        // تجهيز أسماء الأطفال
        const names = result.recordset.map(c => c.childName).join('، ');
        const count = result.recordset.length;

        const title = '🎂 أعياد ميلاد اليوم';
        const message = count === 1
            ? `عيد ميلاد ${names} - أصبح عمره ${result.recordset[0].age} سنة 🎉`
            : `${count} أطفال عيد ميلادهم اليوم: ${names} 🎉`;

        // إرسال إشعار لكل المستخدمين
        await createAndPushToAll(title, message, 'Birthday');

        return res.status(200).json({
            success: true,
            message: `تم إرسال إشعار أعياد الميلاد`,
            count: count,
            children: result.recordset.map(c => ({
                name: c.childName,
                age: c.age,
                branch: c.branchName,
                fatherPhone: c.FatherMobile1,
                motherPhone: c.MotherMobile1,
            }))
        });

    } catch (err) {
        console.error('sendBirthdayReminders error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في إرسال إشعارات أعياد الميلاد',
            error: err.message
        });
    }
};

module.exports = {
    getAllChildren,
    getChildById,
    createNewChild,
    updateChild,
    deleteChild,
    getTodayBirthdays,
    getUpcomingBirthdays,
    sendBirthdayReminders
};