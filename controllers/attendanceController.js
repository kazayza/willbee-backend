const { sql } = require('../config/db');
const { createAndPushNotification } = require('./notificationController');

// 1. حفظ قائمة الغائبين (تسجيل جديد أو تعديل)
// 1. حفظ قائمة الغائبين (مع دعم تعدد الفصول)
const saveAbsenceList = async (req, res) => {
    // 👈 ضفنا classId هنا
    const { date, user, actionTime, absentChildren, classId } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();
        let masterID;

        // أ. التعامل مع الـ Master Record (سجل اليوم)
        const checkRequest = new sql.Request(transaction);
        checkRequest.input('date', sql.Date, date);
        const checkResult = await checkRequest.query(`SELECT ID FROM tbl_absenseChild WHERE CAST(Databsense AS DATE) = @date`);

        if (checkResult.recordset.length > 0) {
            masterID = checkResult.recordset[0].ID;
            // تحديث بيانات المعدل
            const updateRequest = new sql.Request(transaction);
            updateRequest.input('id', sql.Int, masterID);
            updateRequest.input('user', sql.VarChar, user);
            updateRequest.input('time', sql.DateTime, actionTime);
            await updateRequest.query(`UPDATE tbl_absenseChild SET useredit = @user, editTime = @time WHERE ID = @id`);
        } else {
            const insertRequest = new sql.Request(transaction);
            insertRequest.input('date', sql.DateTime, date);
            insertRequest.input('user', sql.VarChar, user);
            insertRequest.input('time', sql.DateTime, actionTime);
            const insertResult = await insertRequest.query(`
                INSERT INTO tbl_absenseChild (Databsense, userAdd, Addtime)
                OUTPUT inserted.ID
                VALUES (@date, @user, @time)
            `);
            masterID = insertResult.recordset[0].ID;
        }

        // ب. التنظيف الذكي (Smart Cleanup) 🧹
        // بنمسح أي غياب مسجل اليوم ده لأي طفل ينتمي للفصل الحالي
        // عشان نضمن إننا بنحدث حالة الفصل ده بالكامل (حضور وغياب)
        const cleanupRequest = new sql.Request(transaction);
        cleanupRequest.input('masterID', sql.Int, masterID);
        cleanupRequest.input('classId', sql.Int, classId);

        await cleanupRequest.query(`
            DELETE D
            FROM tbl_absenceDetalis D
            INNER JOIN tbl_ChildClassHistory H ON D.Child_code = H.Child_ID
            WHERE D.ID = @masterID
            AND H.Class_ID = @classId
            AND H.LeaveDate IS NULL -- نتأكد إنه لسه في الفصل
        `);

        // ج. تسجيل الغائبين الجدد
        if (absentChildren && absentChildren.length > 0) {
            for (const child of absentChildren) {
                const detailRequest = new sql.Request(transaction);
                detailRequest.input('masterID', sql.Int, masterID);
                detailRequest.input('childId', sql.Int, child.childId);
                detailRequest.input('status', sql.Bit, 1);
                detailRequest.input('notes', sql.VarChar, child.notes || '');

                await detailRequest.query(`
                    INSERT INTO tbl_absenceDetalis (ID, Child_code, Absence, Notes)
                    VALUES (@masterID, @childId, @status, @notes)
                `);
            }
        }

        await transaction.commit();
         // ============================================================
        // 🚀 إرسال إشعار تجاوز الحد (لـ Admin و PRUser)
        // ============================================================
        
        // 1. التحقق من التجاوز
        if (absentChildren && absentChildren.length > 0) {
            const ids = absentChildren.map(c => c.childId).join(',');
            
            // كويري يجيب الأطفال اللي غابوا أكتر من 3 مرات في نفس الشهر
            const alertQuery = `
                SELECT 
                    C.ID_Child,
                    C.FullNameArabic, 
                    COUNT(*) as Count,
                    Cl.ClassName,       -- اسم الفصل
                    B.branchName        -- اسم الفرع
                FROM tbl_absenceDetalis D
                INNER JOIN tbl_absenseChild M ON D.ID = M.ID
                INNER JOIN tbl_Child C ON D.Child_code = C.ID_Child
                -- انضمام عشان نجيب الفصل الحالي والفرع
                INNER JOIN tbl_ChildClassHistory H ON C.ID_Child = H.Child_ID
                INNER JOIN tbl_Classroom Cl ON H.Class_ID = Cl.Class_ID
                INNER JOIN tbl_Branch B ON C.Branch = B.IDbranch
                
                WHERE D.Child_code IN (${ids})
                AND MONTH(M.Databsense) = MONTH(@date)
                AND YEAR(M.Databsense) = YEAR(@date)
                AND H.LeaveDate IS NULL -- شرط مهم: الفصل الحالي فقط
                
                GROUP BY C.ID_Child, C.FullNameArabic, Cl.ClassName, B.branchName
                HAVING COUNT(*) > 3
            `;
            
            const requestAlert = new sql.Request();
            requestAlert.input('date', sql.Date, date);
            const alertResult = await requestAlert.query(alertQuery);

            // لو لقينا أطفال تجاوزوا الحد
            if (alertResult.recordset.length > 0) {
                
                // 2. نجيب المستخدمين المستهدفين (Admin + PRUser)
                const targetUsersRequest = new sql.Request();
                const targetUsers = await targetUsersRequest.query(`
                    SELECT UserId FROM tbl_users 
                    WHERE Role IN ('Admin', 'PRUser') -- 👈 التعديل حسب طلبك
                `);

                 // 3. إرسال الإشعارات
                for (const record of alertResult.recordset) {
                    // الرسالة التفصيلية الجديدة
                    const message = `تجاوز الطالب "${record.FullNameArabic}" (${record.branchName} - ${record.ClassName}) حد الغياب (${record.Count} أيام)`;
                    
                    for (const u of targetUsers.recordset) {
                        createAndPushNotification(
                            u.UserId,
                            '⚠️ تنبيه غياب متكرر',
                            message,
                            'Absence',
                            'child_profile',
                            record.ID_Child
                        ).catch(err => console.error("Notification Failed:", err));
                    }
                }
            }
        }

        // الرد النهائي (بدون رسالة التنبيه النصية خلاص)
        res.status(200).json({ message: 'تم حفظ الغياب بنجاح ✅' });

    } catch (err) {
        if (transaction._aborted === false) await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'فشل الحفظ', error: err.message });
    }
};

// 2. تقرير الغياب اليومي (للمدير)
// 2. تقرير الغياب المتقدم (فلاتر شاملة)
const getAbsenceReport = async (req, res) => {
    // بنستقبل المعاملات من الرابط
    const { fromDate, toDate, branchId, classId, childId } = req.query;

    try {
        const request = new sql.Request();
        
        // بناء جملة الاستعلام ديناميكياً
        let query = `
            SELECT 
                C.FullNameArabic,
                C.ID_Child,
                B.branchName,
                V.ClassName,
                D.Notes,
                M.Databsense AS Date, -- تاريخ الغياب
                M.userAdd
            FROM tbl_absenseChild M
            JOIN tbl_absenceDetalis D ON M.ID = D.ID
            JOIN tbl_Child C ON D.Child_code = C.ID_Child
            LEFT JOIN tbl_Branch B ON C.Branch = B.IDbranch
            LEFT JOIN vw_ChildrenCurrentClass V ON C.ID_Child = V.ID_Child
            WHERE 1=1 
        `;

        // 1. فلتر الفترة الزمنية
        if (fromDate && toDate) {
            request.input('from', sql.Date, fromDate);
            request.input('to', sql.Date, toDate);
            query += ` AND CAST(M.Databsense AS DATE) BETWEEN @from AND @to`;
        } else if (fromDate) { // لو يوم واحد بس
            request.input('date', sql.Date, fromDate);
            query += ` AND CAST(M.Databsense AS DATE) = @date`;
        }

        // 2. فلتر الفرع
        if (branchId) {
            request.input('branch', sql.Int, branchId);
            query += ` AND C.Branch = @branch`;
        }

        // 3. فلتر الفصل
        if (classId) {
            request.input('class', sql.Int, classId);
            query += ` AND V.Class_ID = @class`;
        }

        // 4. فلتر طفل معين (للتاريخ الشخصي)
        if (childId) {
            request.input('child', sql.Int, childId);
            query += ` AND C.ID_Child = @child`;
        }

        query += ` ORDER BY M.Databsense DESC, B.branchName, V.ClassName`;

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// 3. جلب طلاب الفصل + حالة الغياب (للشاشة الذكية)
const getStudentsForAttendance = async (req, res) => {
    const { classId, date } = req.query;

    try {
        const request = new sql.Request();
        request.input('classId', sql.Int, classId);
        request.input('date', sql.Date, date);

        // الاستعلام ده بيجيب كل طلاب الفصل، ويعمل Join مع جدول الغياب
        // عشان يرجعلك (IsAbsent = 1) لو الطالب ده متسجل غياب النهاردة
        const query = `
            SELECT 
                C.ID_Child,
                C.FullNameArabic,
                C.Age,
                CASE WHEN D.Absence IS NOT NULL THEN 1 ELSE 0 END as IsAbsent,
                D.Notes
            FROM tbl_Child C
            INNER JOIN tbl_ChildClassHistory H ON C.ID_Child = H.Child_ID
            LEFT JOIN (
                SELECT Detail.Child_code, Detail.Absence, Detail.Notes
                FROM tbl_absenceDetalis Detail
                INNER JOIN tbl_absenseChild Master ON Detail.ID = Master.ID
                WHERE CAST(Master.Databsense AS DATE) = @date
            ) D ON C.ID_Child = D.Child_code
            WHERE H.Class_ID = @classId 
              AND H.LeaveDate IS NULL
            ORDER BY C.FullNameArabic
        `;

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        res.status(500).json({ message: 'Error fetching students', error: err.message });
    }
};

// 4. سجل غياب طفل معين (لبروفايل الطفل)
const getChildAbsenceHistory = async (req, res) => {
    const { childId } = req.params;

    try {
        const request = new sql.Request();
        request.input('childId', sql.Int, childId);

        const query = `
            SELECT 
                M.Databsense AS Date,
                D.Notes,
                M.userAdd
            FROM tbl_absenceDetalis D
            INNER JOIN tbl_absenseChild M ON D.ID = M.ID
            WHERE D.Child_code = @childId
            ORDER BY M.Databsense DESC
        `;

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    saveAbsenceList,
    getAbsenceReport,
    getStudentsForAttendance,
    getChildAbsenceHistory
};