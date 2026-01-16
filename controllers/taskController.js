const { sql } = require('../config/db');
const { createSystemNotification } = require('./notificationController');

// 1. إنشاء مهمة جديدة
const createTask = async (req, res) => {
    const { 
        title, 
        description, 
        assignedTo, // ID الموظف المسؤول
        assignedBy, // ID المدير اللي كلفه (ممكن يكون userCode من اللوجين)
        priority,   // High, Medium, Low
        dueDate,    // تاريخ الاستحقاق
        customerId, // لو المهمة مرتبطة بولي أمر/طفل معين
        notes 
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('title', sql.NVarChar, title);
        request.input('desc', sql.NVarChar, description);
        request.input('to', sql.Int, assignedTo);
        request.input('by', sql.Int, assignedBy); // ممكن يكون null
        request.input('prio', sql.NVarChar, priority || 'Medium');
        request.input('due', sql.DateTime, dueDate);
        request.input('cust', sql.Int, customerId);
        request.input('notes', sql.NVarChar, notes);

        await request.query(`
            INSERT INTO tbl_Tasks 
            (Title, Description, AssignedTo, AssignedBy, Priority, DueDate, CustomerID, Notes, Status, CreatedAt)
            VALUES 
            (@title, @desc, @to, @by, @prio, @due, @cust, @notes, 'Pending', GETDATE())
        `);

        res.status(201).json({ message: 'تم إسناد المهمة للموظف بنجاح ✅' });

        // 👇 إضافة: إرسال إشعار للموظف
        await createSystemNotification(
            assignedTo, 
            'مهمة جديدة 📋', 
            `تم تكليفك بمهمة جديدة: ${title}`, 
            'Task'
        );

        res.status(201).json({ message: 'تم إسناد المهمة وإرسال الإشعار ✅' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في إنشاء المهمة', error: err.message });
    }
};

// 2. عرض مهام موظف معين (My Tasks)
const getMyTasks = async (req, res) => {
    const { empId } = req.params; // ID الموظف
    const { status } = req.query; // فلتر اختياري بالحالة (Pending/Completed)

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, empId);

        let query = `
            SELECT 
                t.TaskID, 
                t.Title, 
                t.Description, 
                t.Priority, 
                t.Status, 
                t.DueDate,
                t.Notes,
                c.FullNameArabic as ChildName -- لو مرتبطة بطفل
            FROM tbl_Tasks t
            LEFT JOIN tbl_Child c ON t.CustomerID = c.ID_Child -- افترضنا الربط مع الطفل
            WHERE t.AssignedTo = @id AND t.IsDeleted = 0
        `;

        if (status) {
            request.input('stat', sql.NVarChar, status);
            query += ' AND t.Status = @stat';
        }

        query += ' ORDER BY t.DueDate ASC'; // الأقرب في التاريخ يظهر الأول

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. تحديث حالة المهمة (إنجاز المهمة)
const updateTaskStatus = async (req, res) => {
    const { taskId } = req.params;
    const { status, notes } = req.body; // Status: 'Completed', 'In Progress'

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, taskId);
        request.input('stat', sql.NVarChar, status);
        request.input('notes', sql.NVarChar, notes); // ملاحظات الإغلاق

        await request.query(`
            UPDATE tbl_Tasks 
            SET Status = @stat, 
                Notes = ISNULL(Notes, '') + ' | ' + @notes, -- بنزود الملاحظات على القديم
                CompletedDate = CASE WHEN @stat = 'Completed' THEN GETDATE() ELSE NULL END,
                UpdatedAt = GETDATE()
            WHERE TaskID = @id
        `);

        res.status(200).json({ message: 'تم تحديث حالة المهمة بنجاح 🔄' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    createTask,
    getMyTasks,
    updateTaskStatus
};