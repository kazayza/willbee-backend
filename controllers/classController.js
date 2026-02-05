const { sql } = require('../config/db');

// ========== دالة مساعدة لتوقيت مصر (Native JS) ==========
const getEgyptTime = () => {
    const now = new Date();
    // تحويل لتوقيت مصر
    const egyptTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    return egyptTime;
};

// ========== دالة مساعدة للـ Validation ==========
const validateRequired = (fields, res) => {
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null || value === '') {
            res.status(400).json({ 
                success: false,
                message: `الحقل "${key}" مطلوب ❌` 
            });
            return false;
        }
    }
    return true;
};

// ================================================================
// 1. لوحة تحكم الفصول (Dashboard)
// ================================================================
const getClassesDashboard = async (req, res) => {
    const { branchId } = req.query;

    if (!branchId || isNaN(branchId)) {
        return res.status(400).json({ 
            success: false,
            message: 'رقم الفرع مطلوب ويجب أن يكون رقم صحيح' 
        });
    }

    try {
        const query = `
            SELECT 
                C.Class_ID,
                C.ClassName,
                C.Capacity,
                C.Notes,
                C.IsActive,
                
                (SELECT COUNT(*) 
                 FROM tbl_ChildClassHistory H 
                 WHERE H.Class_ID = C.Class_ID AND H.LeaveDate IS NULL) AS CurrentStudentCount,

                STUFF((SELECT ', ' + E.empName
                       FROM tbl_ClassroomTeacherAssign A
                       INNER JOIN tbl_empolyee E ON A.Emp_ID = E.ID
                       WHERE A.Class_ID = C.Class_ID AND A.IsActive = 1
                       FOR XML PATH('')), 1, 2, '') AS TeachersNames

            FROM tbl_Classroom C
            WHERE C.BranchID = @branchId AND C.IsActive = 1
            ORDER BY C.ClassName
        `;

        const request = new sql.Request();
        request.input('branchId', sql.SmallInt, parseInt(branchId));
        
        const result = await request.query(query);

        const classesData = result.recordset.map(cls => ({
            ...cls,
            RemainingSeats: cls.Capacity - cls.CurrentStudentCount,
            IsFull: (cls.Capacity - cls.CurrentStudentCount) <= 0
        }));

        res.status(200).json({
            success: true,
            count: classesData.length,
            data: classesData
        });

    } catch (err) {
        console.error('getClassesDashboard Error:', err);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في جلب بيانات الفصول', 
            error: err.message 
        });
    }
};

// ================================================================
// 2. تسكين أو نقل طالب
// ================================================================
const assignStudent = async (req, res) => {
    const { childId, classId, notes, userAdd } = req.body;

    if (!validateRequired({ childId, classId }, res)) return;

    const transaction = new sql.Transaction();
    const egyptTime = getEgyptTime();

    try {
        await transaction.begin();
        const request = new sql.Request(transaction);

        request.input('childId', sql.Int, parseInt(childId));
        request.input('classId', sql.Int, parseInt(classId));
        request.input('egyptTime', sql.DateTime, egyptTime);

        // 1. التأكد من تطابق الفرع
        const branchCheck = await request.query(
            `SELECT dbo.fn_CheckChildBranchClass(@childId, @classId) as IsValid`
        );
        if (!branchCheck.recordset[0].IsValid) {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false,
                message: "لا يمكن تسكين الطفل في فصل تابع لفرع آخر" 
            });
        }

        // 2. التأكد من السعة
        const capacityCheck = await request.query(`
            SELECT 
                (C.Capacity - (SELECT COUNT(*) FROM tbl_ChildClassHistory WHERE Class_ID = @classId AND LeaveDate IS NULL)) as Remaining
            FROM tbl_Classroom C WHERE C.Class_ID = @classId
        `);
        
        if (!capacityCheck.recordset[0] || capacityCheck.recordset[0].Remaining <= 0) {
            await transaction.rollback();
            return res.status(400).json({ 
                success: false,
                message: "هذا الفصل ممتلئ بالكامل" 
            });
        }

        // 3. إغلاق الفصل القديم
        await request.query(`
            UPDATE tbl_ChildClassHistory 
            SET LeaveDate = @egyptTime 
            WHERE Child_ID = @childId AND LeaveDate IS NULL
        `);

        // 4. فتح السجل الجديد
        request.input('notes', sql.NVarChar, notes || '');
        request.input('user', sql.VarChar, userAdd || 'System');
        
        await request.query(`
            INSERT INTO tbl_ChildClassHistory 
            (Child_ID, Class_ID, JoinDate, Notes, userAdd, Addtime)
            VALUES 
            (@childId, @classId, @egyptTime, @notes, @user, @egyptTime)
        `);

        await transaction.commit();
        
        res.status(200).json({ 
            success: true,
            message: 'تم نقل/تسكين الطفل بنجاح' 
        });

    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback Error:', rollbackErr);
        }
        
        console.error('assignStudent Error:', err);
        res.status(500).json({ 
            success: false,
            message: 'فشلت عملية التسكين',
            error: err.message 
        });
    }
};

// ================================================================
// 3. إضافة مدرس للفصل
// ================================================================
const addTeacherToClass = async (req, res) => {
    const { classId, empId, notes, userAdd } = req.body;

    if (!validateRequired({ classId, empId }, res)) return;

    const egyptTime = getEgyptTime();

    try {
        const request = new sql.Request();
        request.input('classId', sql.Int, parseInt(classId));
        request.input('empId', sql.Int, parseInt(empId));

        // 1. التأكد إن المدرس مش معين فعلاً
        const duplicateCheck = await request.query(`
            SELECT 1 FROM tbl_ClassroomTeacherAssign 
            WHERE Class_ID = @classId AND Emp_ID = @empId AND IsActive = 1
        `);
        
        if (duplicateCheck.recordset.length > 0) {
            return res.status(409).json({ 
                success: false,
                message: 'المدرس معين بالفعل لهذا الفصل' 
            });
        }

        // 2. التأكد إن المدرس والفصل نفس الفرع
        const checkResult = await request.query(`
            SELECT 1 
            FROM tbl_Classroom C
            JOIN tbl_empolyee E ON E.BranchID = C.BranchID
            WHERE C.Class_ID = @classId AND E.ID = @empId
        `);
        
        if (checkResult.recordset.length === 0) {
            return res.status(400).json({ 
                success: false,
                message: 'المدرس والفصل يجب أن يكونوا في نفس الفرع' 
            });
        }

        // 3. الإضافة
        request.input('notes', sql.NVarChar, notes || '');
        request.input('user', sql.VarChar, userAdd || 'System');
        request.input('egyptTime', sql.DateTime, egyptTime);

        await request.query(`
            INSERT INTO tbl_ClassroomTeacherAssign 
            (Class_ID, Emp_ID, AssignDate, Notes, IsActive, userAdd, Addtime)
            VALUES 
            (@classId, @empId, @egyptTime, @notes, 1, @user, @egyptTime)
        `);

        res.status(201).json({ 
            success: true,
            message: 'تم تعيين المدرس للفصل بنجاح' 
        });

    } catch (err) {
        console.error('addTeacherToClass Error:', err);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في التعيين', 
            error: err.message 
        });
    }
};

// ================================================================
// 4. إلغاء تكليف مدرس من فصل
// ================================================================
const removeTeacherFromClass = async (req, res) => {
    const assignId = req.body.assignId || req.params.assignId;

    if (!assignId || isNaN(assignId)) {
        return res.status(400).json({ 
            success: false,
            message: 'رقم التكليف مطلوب ويجب أن يكون رقم صحيح' 
        });
    }

    const egyptTime = getEgyptTime();

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, parseInt(assignId));
        request.input('egyptTime', sql.DateTime, egyptTime);

        const result = await request.query(`
            UPDATE tbl_ClassroomTeacherAssign
            SET IsActive = 0, editTime = @egyptTime
            WHERE ID = @id AND IsActive = 1
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'التكليف غير موجود أو ملغي مسبقاً' 
            });
        }

        res.status(200).json({ 
            success: true,
            message: 'تم إلغاء تكليف المدرس من الفصل' 
        });

    } catch (err) {
        console.error('removeTeacherFromClass Error:', err);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في إلغاء التكليف', 
            error: err.message 
        });
    }
};

// ================================================================
// 5. جلب الأطفال غير المسكنين
// ================================================================
const getUnassignedChildren = async (req, res) => {
    const { branchId } = req.query;

    if (!branchId || isNaN(branchId)) {
        return res.status(400).json({ 
            success: false,
            message: 'رقم الفرع مطلوب ويجب أن يكون رقم صحيح' 
        });
    }

    try {
        const request = new sql.Request();
        request.input('branchId', sql.SmallInt, parseInt(branchId));

        const result = await request.query(`
            SELECT C.ID_Child, C.FullNameArabic, C.Age, C.birthDate
            FROM tbl_Child C
            WHERE C.Branch = @branchId
            AND C.Status = 1
            AND NOT EXISTS (
                SELECT 1 FROM tbl_ChildClassHistory H 
                WHERE H.Child_ID = C.ID_Child AND H.LeaveDate IS NULL
            )
            ORDER BY C.FullNameArabic
        `);
        
        res.status(200).json({
            success: true,
            count: result.recordset.length,
            data: result.recordset
        });

    } catch (err) {
        console.error('getUnassignedChildren Error:', err);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في جلب البيانات',
            error: err.message 
        });
    }
};

// ================================================================
// 6. إضافة فصل جديد
// ================================================================
const addClass = async (req, res) => {
    const { className, branchId, capacity, notes, userAdd } = req.body;

    console.log('addClass Request:', req.body);

    if (!validateRequired({ className, branchId, capacity }, res)) return;

    if (isNaN(capacity) || parseInt(capacity) <= 0) {
        return res.status(400).json({ 
            success: false,
            message: 'السعة يجب أن تكون رقم أكبر من صفر' 
        });
    }

    const egyptTime = getEgyptTime();

    try {
        const request = new sql.Request();
        request.input('name', sql.NVarChar, className.trim());
        request.input('branch', sql.SmallInt, parseInt(branchId));
        request.input('cap', sql.Int, parseInt(capacity));
        request.input('notes', sql.NVarChar, notes || '');
        request.input('user', sql.VarChar, userAdd || 'System');
        request.input('egyptTime', sql.DateTime, egyptTime);

        const result = await request.query(`
            INSERT INTO tbl_Classroom 
            (ClassName, BranchID, Capacity, Notes, IsActive, userAdd, Addtime)
            OUTPUT INSERTED.Class_ID
            VALUES 
            (@name, @branch, @cap, @notes, 1, @user, @egyptTime)
        `);

        res.status(201).json({ 
            success: true,
            message: 'تم إضافة الفصل بنجاح',
            classId: result.recordset[0].Class_ID
        });

    } catch (err) {
        console.error('addClass Error:', err);
        
        if (err.number === 2627 || err.number === 2601) {
            return res.status(409).json({ 
                success: false,
                message: 'اسم الفصل موجود مسبقاً في هذا الفرع' 
            });
        }
        
        res.status(500).json({ 
            success: false,
            message: 'فشل إضافة الفصل', 
            error: err.message
        });
    }
};

// ================================================================
// 7. تعديل بيانات الفصل
// ================================================================
const updateClass = async (req, res) => {
    const { id } = req.params;
    const { className, capacity, notes, isActive, userEdit } = req.body;

    // Debug
    console.log('updateClass - ID:', id);
    console.log('updateClass - Body:', req.body);

    // Validation
    if (!id || isNaN(id)) {
        return res.status(400).json({ 
            success: false,
            message: 'رقم الفصل غير صحيح أو مفقود',
            receivedId: id
        });
    }

    if (!validateRequired({ className, capacity }, res)) return;

    if (isNaN(capacity) || parseInt(capacity) <= 0) {
        return res.status(400).json({ 
            success: false,
            message: 'السعة يجب أن تكون رقم أكبر من صفر' 
        });
    }

    const egyptTime = getEgyptTime();

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, parseInt(id));
        request.input('name', sql.NVarChar, className.trim());
        request.input('cap', sql.Int, parseInt(capacity));
        request.input('notes', sql.NVarChar, notes || '');
        request.input('user', sql.VarChar, userEdit || 'System');
        request.input('egyptTime', sql.DateTime, egyptTime);
        
        // التعامل مع isActive
        let activeValue = 1;
        if (isActive !== undefined && isActive !== null) {
            if (typeof isActive === 'boolean') {
                activeValue = isActive ? 1 : 0;
            } else if (typeof isActive === 'string') {
                activeValue = (isActive.toLowerCase() === 'true' || isActive === '1') ? 1 : 0;
            } else {
                activeValue = isActive ? 1 : 0;
            }
        }
        request.input('active', sql.Bit, activeValue);

        // التأكد من وجود الفصل
        const checkExist = await request.query(
            `SELECT Class_ID, BranchID FROM tbl_Classroom WHERE Class_ID = @id`
        );
        
        if (checkExist.recordset.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'الفصل غير موجود'
            });
        }

        const branchId = checkExist.recordset[0].BranchID;
        request.input('branchId', sql.SmallInt, branchId);

        // التأكد من عدم تكرار الاسم
        const duplicateCheck = await request.query(`
            SELECT 1 FROM tbl_Classroom 
            WHERE ClassName = @name AND BranchID = @branchId AND Class_ID != @id
        `);
        
        if (duplicateCheck.recordset.length > 0) {
            return res.status(409).json({ 
                success: false,
                message: 'اسم الفصل موجود مسبقاً في هذا الفرع' 
            });
        }

        // التنفيذ
        await request.query(`
            UPDATE tbl_Classroom
            SET 
                ClassName = @name,
                Capacity = @cap,
                Notes = @notes,
                IsActive = @active,
                useredit = @user,
                editTime = @egyptTime
            WHERE Class_ID = @id
        `);

        res.status(200).json({ 
            success: true,
            message: 'تم تعديل بيانات الفصل بنجاح'
        });

    } catch (err) {
        console.error('updateClass Error:', err);
        res.status(500).json({ 
            success: false,
            message: 'فشل التعديل', 
            error: err.message
        });
    }
};

// ================================================================
// 8. جلب فصل واحد بالـ ID
// ================================================================
const getClassById = async (req, res) => {
    const { id } = req.params;

    if (!id || isNaN(id)) {
        return res.status(400).json({ 
            success: false,
            message: 'رقم الفصل غير صحيح' 
        });
    }

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, parseInt(id));

        const result = await request.query(`
            SELECT 
                C.Class_ID,
                C.ClassName,
                C.BranchID,
                C.Capacity,
                C.Notes,
                C.IsActive,
                C.Addtime,
                C.editTime,
                (SELECT COUNT(*) 
                 FROM tbl_ChildClassHistory H 
                 WHERE H.Class_ID = C.Class_ID AND H.LeaveDate IS NULL) AS CurrentStudentCount
            FROM tbl_Classroom C
            WHERE C.Class_ID = @id
        `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'الفصل غير موجود' 
            });
        }

        res.status(200).json({
            success: true,
            data: result.recordset[0]
        });

    } catch (err) {
        console.error('getClassById Error:', err);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في جلب البيانات',
            error: err.message 
        });
    }
};

// ================================================================
// 9. جلب أطفال الفصل (المسكنين حالياً)
// ================================================================
const getClassChildren = async (req, res) => {
    const { classId } = req.params;

    if (!classId || isNaN(classId)) {
        return res.status(400).json({
            success: false,
            message: 'رقم الفصل غير صحيح'
        });
    }

    try {
        const request = new sql.Request();
        request.input('classId', sql.Int, parseInt(classId));

        const result = await request.query(`
            SELECT 
                H.RecordID as HistoryId,
                H.Child_ID,
                H.JoinDate,
                H.Notes as AssignNotes,
                C.FullNameArabic,
                C.Age,
                C.birthDate
            FROM tbl_ChildClassHistory H
            INNER JOIN tbl_Child C ON H.Child_ID = C.ID_Child
            WHERE H.Class_ID = @classId 
            AND H.LeaveDate IS NULL
            ORDER BY H.JoinDate DESC
        `);

        res.status(200).json({
            success: true,
            count: result.recordset.length,
            data: result.recordset
        });

    } catch (err) {
        console.error('getClassChildren Error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب بيانات الأطفال',
            error: err.message
        });
    }
};

// ================================================================
// 10. جلب سجل الفصل (الأطفال السابقين)
// ================================================================
const getClassHistory = async (req, res) => {
    const { classId } = req.params;

    if (!classId || isNaN(classId)) {
        return res.status(400).json({
            success: false,
            message: 'رقم الفصل غير صحيح'
        });
    }

    try {
        const request = new sql.Request();
        request.input('classId', sql.Int, parseInt(classId));

        const result = await request.query(`
            SELECT 
                H.RecordID as HistoryId,
                H.Child_ID,
                H.JoinDate,
                H.LeaveDate,
                H.Notes as AssignNotes,
                C.FullNameArabic,
                C.Age
            FROM tbl_ChildClassHistory H
            INNER JOIN tbl_Child C ON H.Child_ID = C.ID_Child
            WHERE H.Class_ID = @classId 
            AND H.LeaveDate IS NOT NULL
            ORDER BY H.LeaveDate DESC
        `);

        res.status(200).json({
            success: true,
            count: result.recordset.length,
            data: result.recordset
        });

    } catch (err) {
        console.error('getClassHistory Error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب السجل',
            error: err.message
        });
    }
};

// ================================================================
// 11. إخراج طفل من الفصل (بدون نقل)
// ================================================================
const removeStudentFromClass = async (req, res) => {
    const { historyId } = req.params;
    const { userEdit } = req.body;

    if (!historyId || isNaN(historyId)) {
        return res.status(400).json({
            success: false,
            message: 'رقم السجل غير صحيح'
        });
    }

    const egyptTime = getEgyptTime();

    try {
        const request = new sql.Request();
        request.input('historyId', sql.Int, parseInt(historyId));
        request.input('egyptTime', sql.DateTime, egyptTime);
        request.input('user', sql.VarChar, userEdit || 'System');

        const checkResult = await request.query(`
            SELECT H.RecordID, H.Child_ID, C.FullNameArabic
            FROM tbl_ChildClassHistory H
            INNER JOIN tbl_Child C ON H.Child_ID = C.ID_Child
            WHERE H.RecordID = @historyId AND H.LeaveDate IS NULL
        `);

        if (checkResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'السجل غير موجود أو الطفل خرج بالفعل'
            });
        }

        const childName = checkResult.recordset[0].FullNameArabic;

        await request.query(`
            UPDATE tbl_ChildClassHistory
            SET LeaveDate = @egyptTime, useredit = @user, editTime = @egyptTime
            WHERE RecordID = @historyId
        `);

        res.status(200).json({
            success: true,
            message: `تم إخراج ${childName} من الفصل بنجاح`
        });

    } catch (err) {
        console.error('removeStudentFromClass Error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في إخراج الطفل',
            error: err.message
        });
    }
};

// ================================================================
// 12. نقل طفل لفصل آخر
// ================================================================
const transferStudent = async (req, res) => {
    const { childId, fromClassId, toClassId, notes, userAdd } = req.body;

    // Validation
    if (!childId || !fromClassId || !toClassId) {
        return res.status(400).json({
            success: false,
            message: 'جميع البيانات مطلوبة (childId, fromClassId, toClassId)'
        });
    }

    if (fromClassId === toClassId) {
        return res.status(400).json({
            success: false,
            message: 'الفصل المنقول إليه هو نفس الفصل الحالي'
        });
    }

    const transaction = new sql.Transaction();
    const egyptTime = getEgyptTime();

    try {
        await transaction.begin();
        const request = new sql.Request(transaction);

        request.input('childId', sql.Int, parseInt(childId));
        request.input('fromClassId', sql.Int, parseInt(fromClassId));
        request.input('toClassId', sql.Int, parseInt(toClassId));
        request.input('egyptTime', sql.DateTime, egyptTime);
        request.input('notes', sql.NVarChar, notes || 'نقل من فصل لآخر');
        request.input('user', sql.VarChar, userAdd || 'System');

        // 1. التأكد من تطابق الفرع
        const branchCheck = await request.query(`
            SELECT 
                (SELECT BranchID FROM tbl_Classroom WHERE Class_ID = @fromClassId) as FromBranch,
                (SELECT BranchID FROM tbl_Classroom WHERE Class_ID = @toClassId) as ToBranch
        `);

        if (branchCheck.recordset[0].FromBranch !== branchCheck.recordset[0].ToBranch) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'لا يمكن النقل بين فروع مختلفة'
            });
        }

        // 2. التأكد من سعة الفصل الجديد
        const capacityCheck = await request.query(`
            SELECT 
                (C.Capacity - (SELECT COUNT(*) FROM tbl_ChildClassHistory WHERE Class_ID = @toClassId AND LeaveDate IS NULL)) as Remaining
            FROM tbl_Classroom C WHERE C.Class_ID = @toClassId
        `);

        if (!capacityCheck.recordset[0] || capacityCheck.recordset[0].Remaining <= 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: 'الفصل المنقول إليه ممتلئ'
            });
        }

        // 3. إغلاق السجل القديم
        const closeResult = await request.query(`
            UPDATE tbl_ChildClassHistory
            SET LeaveDate = @egyptTime, useredit = @user, editTime = @egyptTime
            WHERE Child_ID = @childId AND Class_ID = @fromClassId AND LeaveDate IS NULL
        `);

        if (closeResult.rowsAffected[0] === 0) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: 'الطفل غير موجود في الفصل المحدد'
            });
        }

        // 4. فتح سجل جديد في الفصل الجديد
        await request.query(`
            INSERT INTO tbl_ChildClassHistory 
            (Child_ID, Class_ID, JoinDate, Notes, userAdd, Addtime)
            VALUES 
            (@childId, @toClassId, @egyptTime, @notes, @user, @egyptTime)
        `);

        await transaction.commit();

        res.status(200).json({
            success: true,
            message: 'تم نقل الطفل بنجاح'
        });

    } catch (err) {
        try {
            await transaction.rollback();
        } catch (rollbackErr) {
            console.error('Rollback Error:', rollbackErr);
        }

        console.error('transferStudent Error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في نقل الطفل',
            error: err.message
        });
    }
};

// ================================================================
// 13. جلب الفصول المتاحة للنقل (نفس الفرع - فيها أماكن)
// ================================================================
const getAvailableClassesForTransfer = async (req, res) => {
    const { classId } = req.params;

    if (!classId || isNaN(classId)) {
        return res.status(400).json({
            success: false,
            message: 'رقم الفصل غير صحيح'
        });
    }

    try {
        const request = new sql.Request();
        request.input('classId', sql.Int, parseInt(classId));

        // جلب الفصول في نفس الفرع (ماعدا الفصل الحالي) وفيها أماكن
        const result = await request.query(`
            SELECT 
                C.Class_ID,
                C.ClassName,
                C.Capacity,
                (SELECT COUNT(*) FROM tbl_ChildClassHistory WHERE Class_ID = C.Class_ID AND LeaveDate IS NULL) as CurrentCount,
                (C.Capacity - (SELECT COUNT(*) FROM tbl_ChildClassHistory WHERE Class_ID = C.Class_ID AND LeaveDate IS NULL)) as RemainingSeats
            FROM tbl_Classroom C
            WHERE C.BranchID = (SELECT BranchID FROM tbl_Classroom WHERE Class_ID = @classId)
            AND C.Class_ID != @classId
            AND C.IsActive = 1
            AND (C.Capacity - (SELECT COUNT(*) FROM tbl_ChildClassHistory WHERE Class_ID = C.Class_ID AND LeaveDate IS NULL)) > 0
            ORDER BY C.ClassName
        `);

        res.status(200).json({
            success: true,
            count: result.recordset.length,
            data: result.recordset
        });

    } catch (err) {
        console.error('getAvailableClassesForTransfer Error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الفصول',
            error: err.message
        });
    }
};

// ================================================================
// 14. إحصائيات الفصل
// ================================================================
const getClassStatistics = async (req, res) => {
    const { classId } = req.params;

    if (!classId || isNaN(classId)) {
        return res.status(400).json({
            success: false,
            message: 'رقم الفصل غير صحيح'
        });
    }

    try {
        const request = new sql.Request();
        request.input('classId', sql.Int, parseInt(classId));

        const result = await request.query(`
            SELECT 
                C.Class_ID,
                C.ClassName,
                C.Capacity,
                
                -- عدد الطلاب الحاليين
                (SELECT COUNT(*) 
                 FROM tbl_ChildClassHistory H 
                 WHERE H.Class_ID = C.Class_ID AND H.LeaveDate IS NULL) AS CurrentStudentCount,
                
                -- متوسط الأعمار
                (SELECT AVG(CAST(Ch.Age AS FLOAT)) 
                 FROM tbl_ChildClassHistory H 
                 INNER JOIN tbl_Child Ch ON H.Child_ID = Ch.ID_Child
                 WHERE H.Class_ID = C.Class_ID AND H.LeaveDate IS NULL) AS AverageAge,
                
                -- تاريخ آخر تسكين
                (SELECT MAX(H.JoinDate) 
                 FROM tbl_ChildClassHistory H 
                 WHERE H.Class_ID = C.Class_ID AND H.LeaveDate IS NULL) AS LastJoinDate,
                
                -- عدد الطلاب الذين غادروا
                (SELECT COUNT(*) 
                 FROM tbl_ChildClassHistory H 
                 WHERE H.Class_ID = C.Class_ID AND H.LeaveDate IS NOT NULL) AS TotalLeftStudents,
                
                -- إجمالي الطلاب (الحاليين + السابقين)
                (SELECT COUNT(DISTINCT H.Child_ID) 
                 FROM tbl_ChildClassHistory H 
                 WHERE H.Class_ID = C.Class_ID) AS TotalStudentsEver

            FROM tbl_Classroom C
            WHERE C.Class_ID = @classId
        `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'الفصل غير موجود'
            });
        }

        const stats = result.recordset[0];
        
        // حساب نسبة الإشغال
        const occupancyRate = stats.Capacity > 0 
            ? Math.round((stats.CurrentStudentCount / stats.Capacity) * 100) 
            : 0;

        res.status(200).json({
            success: true,
            data: {
                classId: stats.Class_ID,
                className: stats.ClassName,
                capacity: stats.Capacity,
                currentStudentCount: stats.CurrentStudentCount,
                availableSeats: stats.Capacity - stats.CurrentStudentCount,
                occupancyRate: occupancyRate,
                averageAge: stats.AverageAge ? Math.round(stats.AverageAge * 10) / 10 : 0,
                lastJoinDate: stats.LastJoinDate,
                totalLeftStudents: stats.TotalLeftStudents,
                totalStudentsEver: stats.TotalStudentsEver
            }
        });

    } catch (err) {
        console.error('getClassStatistics Error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الإحصائيات',
            error: err.message
        });
    }
};

module.exports = {
    getClassesDashboard,
    assignStudent,
    addTeacherToClass,
    removeTeacherFromClass,
    getUnassignedChildren,
    addClass,
    updateClass,
    getClassById,
    getClassChildren,
    getClassHistory,
    removeStudentFromClass,
    transferStudent,
    getAvailableClassesForTransfer,
    getClassStatistics
};