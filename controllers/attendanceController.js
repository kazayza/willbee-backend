const { sql } = require('../config/db');

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
        res.status(200).json({ message: 'تم حفظ الغياب بنجاح ✅' });

    } catch (err) {
        if (transaction._aborted === false) await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'فشل الحفظ', error: err.message });
    }
};

// 2. تقرير الغياب اليومي (للمدير)
const getAbsenceReport = async (req, res) => {
    const { date, branchId, classId } = req.query;

    try {
        const request = new sql.Request();
        request.input('date', sql.Date, date);

        let query = `
            SELECT 
                C.FullNameArabic,
                B.branchName,
                V.ClassName,
                D.Notes,
                M.userAdd, M.editTime
            FROM tbl_absenseChild M
            JOIN tbl_absenceDetalis D ON M.ID = D.ID
            JOIN tbl_Child C ON D.Child_code = C.ID_Child
            LEFT JOIN tbl_Branch B ON C.Branch = B.IDbranch
            LEFT JOIN vw_ChildrenCurrentClass V ON C.ID_Child = V.ID_Child
            WHERE CAST(M.Databsense AS DATE) = @date
        `;

        if (branchId) query += ` AND C.Branch = ${branchId}`;
        if (classId) query += ` AND V.Class_ID = ${classId}`;

        query += ` ORDER BY B.branchName, V.ClassName, C.FullNameArabic`;

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
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