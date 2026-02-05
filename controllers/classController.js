const { sql } = require('../config/db');

// 1. لوحة تحكم الفصول (أهم دالة للعرض)
const getClassesDashboard = async (req, res) => {
    const { branchId } = req.query; // بنستقبل رقم الفرع

    if (!branchId) {
        return res.status(400).json({ message: 'رقم الفرع مطلوب (branchId)' });
    }

    try {
        // الاستعلام ده بيجيب إحصائيات الفصل + أسماء المدرسين في جملة واحدة
        const query = `
            SELECT 
                C.Class_ID,
                C.ClassName,
                C.Capacity,
                C.Notes,
                
                -- 1. حساب عدد الطلاب الحاليين (اللي لسه ماخرجوش)
                (SELECT COUNT(*) 
                 FROM tbl_ChildClassHistory H 
                 WHERE H.Class_ID = C.Class_ID AND H.LeaveDate IS NULL) AS CurrentStudentCount,

                -- 2. تجميع أسماء المدرسين الحاليين (المفعلين) مفصولين بفاصلة
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
        request.input('branchId', sql.SmallInt, branchId);
        
        const result = await request.query(query);

        // بنضيف حقل محسوب في الجافاسكريبت (المقاعد المتبقية)
        const classesData = result.recordset.map(cls => ({
            ...cls,
            RemainingSeats: cls.Capacity - cls.CurrentStudentCount,
            IsFull: (cls.Capacity - cls.CurrentStudentCount) <= 0
        }));

        res.status(200).json(classesData);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في جلب بيانات الفصول', error: err.message });
    }
};

// 2. تسكين أو نقل طالب (العملية الأوتوماتيكية)
const assignStudent = async (req, res) => {
    const { childId, classId, notes, userAdd } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();
        const request = new sql.Request(transaction);

        // أ. فحوصات الأمان (Validation)
        request.input('childId', sql.Int, childId);
        request.input('classId', sql.Int, classId);

        // 1. التأكد من تطابق الفرع (باستخدام الدالة اللي في الداتا بيز)
        const branchCheck = await request.query(`SELECT dbo.fn_CheckChildBranchClass(@childId, @classId) as IsValid`);
        if (!branchCheck.recordset[0].IsValid) {
            throw new Error("عفواً، لا يمكن تسكين الطفل في فصل تابع لفرع آخر ❌");
        }

        // 2. التأكد من السعة (Capacity Check)
        const capacityCheck = await request.query(`
            SELECT 
                (C.Capacity - (SELECT COUNT(*) FROM tbl_ChildClassHistory WHERE Class_ID = @classId AND LeaveDate IS NULL)) as Remaining
            FROM tbl_Classroom C WHERE C.Class_ID = @classId
        `);
        if (capacityCheck.recordset[0].Remaining <= 0) {
            throw new Error("عفواً، هذا الفصل ممتلئ بالكامل (Full Capacity) ⚠️");
        }

        // ب. التنفيذ (Execution)
        
        // 1. إغلاق الفصل القديم (النقل الأوتوماتيك)
        await request.query(`
            UPDATE tbl_ChildClassHistory 
            SET LeaveDate = GETDATE() 
            WHERE Child_ID = @childId AND LeaveDate IS NULL
        `);

        // 2. فتح السجل الجديد
        request.input('notes', sql.NVarChar, notes);
        request.input('user', sql.VarChar, userAdd);
        
        await request.query(`
            INSERT INTO tbl_ChildClassHistory 
            (Child_ID, Class_ID, JoinDate, Notes, userAdd, Addtime)
            VALUES 
            (@childId, @classId, GETDATE(), @notes, @user, GETDATE())
        `);

        await transaction.commit();
        res.status(200).json({ message: 'تم نقل/تسكين الطفل بنجاح ✅' });

    } catch (err) {
        if (transaction._aborted === false) await transaction.rollback();
        res.status(400).json({ message: err.message || 'فشلت العملية' });
    }
};

// 3. إضافة مدرس للفصل (Assign Teacher)
const addTeacherToClass = async (req, res) => {
    const { classId, empId, notes, userAdd } = req.body;

    try {
        const request = new sql.Request();
        request.input('classId', sql.Int, classId);
        request.input('empId', sql.Int, empId);
        request.input('notes', sql.NVarChar, notes);
        request.input('user', sql.VarChar, userAdd);

        // 1. التأكد إن المدرس والفصل نفس الفرع
        // بنعمل JOIN بسيط عشان نتأكد
        const checkQuery = `
            SELECT 1 
            FROM tbl_Classroom C
            JOIN tbl_empolyee E ON E.BranchID = C.BranchID
            WHERE C.Class_ID = @classId AND E.ID = @empId
        `;
        const checkResult = await request.query(checkQuery);
        
        if (checkResult.recordset.length === 0) {
            return res.status(400).json({ message: 'المدرس والفصل يجب أن يكونوا في نفس الفرع ⚠️' });
        }

        // 2. الإضافة
        await request.query(`
            INSERT INTO tbl_ClassroomTeacherAssign 
            (Class_ID, Emp_ID, AssignDate, Notes, IsActive, userAdd, Addtime)
            VALUES 
            (@classId, @empId, GETDATE(), @notes, 1, @user, GETDATE())
        `);

        res.status(200).json({ message: 'تم تعيين المدرس للفصل بنجاح 👨‍🏫' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في التعيين', error: err.message });
    }
};

// 4. حذف (إلغاء تفعيل) مدرس من فصل
const removeTeacherFromClass = async (req, res) => {
    const { assignId } = req.body; // هنا بناخد ID العلاقة نفسها (السطر في الجدول)

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, assignId);

        await request.query(`
            UPDATE tbl_ClassroomTeacherAssign
            SET IsActive = 0
            WHERE ID = @id
        `);

        res.status(200).json({ message: 'تم إلغاء تكليف المدرس من الفصل 🗑️' });

    } catch (err) {
        res.status(500).json({ message: 'خطأ', error: err.message });
    }
};

// 5. جلب الأطفال "غير المسكنين" (للتسهيل على المشرفة)
const getUnassignedChildren = async (req, res) => {
    const { branchId } = req.query;

    try {
        const request = new sql.Request();
        request.input('branchId', sql.SmallInt, branchId);

        // بنجيب الأطفال اللي في الفرع ده، وملهمش سجل مفتوح (LeaveDate IS NULL) في الهيستوري
        const query = `
            SELECT C.ID_Child, C.FullNameArabic, C.Age, C.birthDate
            FROM tbl_Child C
            WHERE C.Branch = @branchId
            AND C.Status = 1
            AND NOT EXISTS (
                SELECT 1 FROM tbl_ChildClassHistory H 
                WHERE H.Child_ID = C.ID_Child AND H.LeaveDate IS NULL
            )
        `;
        
        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. إضافة فصل جديد (Create Class)
const addClass = async (req, res) => {
    const { className, branchId, capacity, notes, userAdd } = req.body;

    try {
        const request = new sql.Request();
        request.input('name', sql.NVarChar, className);
        request.input('branch', sql.SmallInt, branchId);
        request.input('cap', sql.Int, capacity);
        request.input('notes', sql.NVarChar, notes);
        request.input('user', sql.VarChar, userAdd);

        // جملة الإضافة
        await request.query(`
            INSERT INTO tbl_Classroom 
            (ClassName, BranchID, Capacity, Notes, IsActive, userAdd, Addtime)
            VALUES 
            (@name, @branch, @cap, @notes, 1, @user, GETDATE())
        `);

        res.status(201).json({ message: 'تم إضافة الفصل بنجاح ✅' });

    } catch (err) {
        console.error(err);
        // لو الاسم متكرر في نفس الفرع (بناءً على الـ Constraint اللي في الداتا بيز)
        if (err.number === 2627 || err.number === 2601) {
            return res.status(409).json({ message: 'اسم الفصل موجود مسبقاً في هذا الفرع ⚠️' });
        }
        res.status(500).json({ message: 'فشل إضافة الفصل', error: err.message });
    }
};

module.exports = {
    getClassesDashboard,
    assignStudent,
    addTeacherToClass,
    removeTeacherFromClass,
    getUnassignedChildren,
    addClass
};