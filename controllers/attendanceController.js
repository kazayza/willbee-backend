const { sql } = require('../config/db');

// 1. حفظ قائمة الغائبين (تسجيل جديد أو تعديل يوم سابق)
const saveAbsenceList = async (req, res) => {
    // actionTime: توقيت الموبايل لحظة الضغط
    // date: تاريخ يوم الغياب (ممكن يكون النهاردة أو امبارح)
    // absentChildren: مصفوفة فيها أرقام الأطفال الغائبين فقط [{childId, notes}]
    const { date, user, actionTime, absentChildren } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();
        let masterID;

        // 1. البحث: هل تم تسجيل غياب لهذا اليوم من قبل؟
        const checkRequest = new sql.Request(transaction);
        checkRequest.input('date', sql.Date, date); // بنبحث بالتاريخ فقط
        
        const checkResult = await checkRequest.query(`
            SELECT ID FROM tbl_absenseChild WHERE CAST(Databsense AS DATE) = @date
        `);

        if (checkResult.recordset.length > 0) {
            // ===========================
            // حالة أ: اليوم ده موجود (تعديل)
            // ===========================
            masterID = checkResult.recordset[0].ID;

            const updateRequest = new sql.Request(transaction);
            updateRequest.input('id', sql.Int, masterID);
            updateRequest.input('user', sql.VarChar, user);
            updateRequest.input('time', sql.DateTime, actionTime); // توقيت الموبايل

            // بنحدث بس مين اللي عدل وامتى
            await updateRequest.query(`
                UPDATE tbl_absenseChild 
                SET useredit = @user, editTime = @time 
                WHERE ID = @id
            `);

            // بنمسح التفاصيل القديمة عشان نحط الجديد (Clean Slate)
            // ده بيضمن إن لو طفل كان غياب واتشال من القائمة، يتمسح من الداتا بيز
            await updateRequest.query(`DELETE FROM tbl_absenceDetalis WHERE ID = @id`);

        } else {
            // ===========================
            // حالة ب: تسجيل أول مرة لليوم ده (جديد)
            // ===========================
            const insertRequest = new sql.Request(transaction);
            insertRequest.input('date', sql.DateTime, date);
            insertRequest.input('user', sql.VarChar, user);
            insertRequest.input('time', sql.DateTime, actionTime); // توقيت الموبايل

            const insertResult = await insertRequest.query(`
                INSERT INTO tbl_absenseChild (Databsense, userAdd, Addtime)
                OUTPUT inserted.ID
                VALUES (@date, @user, @time)
            `);
            
            masterID = insertResult.recordset[0].ID;
        }

        // 2. تسجيل قائمة الغائبين (Loop)
        if (absentChildren && absentChildren.length > 0) {
            for (const child of absentChildren) {
                const detailRequest = new sql.Request(transaction);
                detailRequest.input('masterID', sql.Int, masterID);
                detailRequest.input('childId', sql.Int, child.childId);
                // بنسجل 0 لأن الجدول اسمه AbsenceDetails فالوجود فيه يعني غياب
                // أو حسب المنطق بتاعك (لو 1 غياب يبقى نبعت 1)
                // هنا افترضنا الوجود في الجدول = غياب
                requestDetail.input('status', sql.Bit, 1); 
                detailRequest.input('notes', sql.VarChar, child.notes || '');

                await detailRequest.query(`
                    INSERT INTO tbl_absenceDetalis (ID, Child_code, Absence, Notes)
                    VALUES (@masterID, @childId, @status, @notes)
                `);
            }
        }

        await transaction.commit();
        res.status(200).json({ message: 'تم تحديث سجل الغياب بنجاح ✅', recordId: masterID });

    } catch (err) {
        if (transaction._aborted === false) await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'حدث خطأ أثناء الحفظ', error: err.message });
    }
};

// 2. تقرير الغياب (بيجيب الغائبين فقط ليوم محدد)
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
                M.userAdd, M.Addtime, -- مين سجل أول مرة
                M.useredit, M.editTime -- مين عدل وامتى
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

module.exports = {
    saveAbsenceList,
    getAbsenceReport
};