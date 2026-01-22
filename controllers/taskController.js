const { sql } = require('../config/db');
const { createAndPushNotification } = require('./notificationController');

// ✅ دالة مساعدة: جلب UserId من EmpID
const getUserIdByEmpId = async (empId) => {
    try {
        const request = new sql.Request();
        request.input('empId', sql.Int, empId);
        
        const result = await request.query(`
            SELECT UserId FROM tbl_users WHERE EmpID = @empId
        `);
        
        if (result.recordset.length > 0) {
            return result.recordset[0].UserId;
        }
        return null;
    } catch (err) {
        console.error('Error getting UserId by EmpId:', err);
        return null;
    }
};

// 1. إنشاء مهمة جديدة
const createTask = async (req, res) => {
    const { 
        title, 
        description, 
        assignedTo,      // ده EmpID
        assignedBy,      // ده UserId
        priority,
        dueDate,
        customerId,
        leadId,
        notes 
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('title', sql.NVarChar, title);
        request.input('desc', sql.NVarChar, description || null);
        request.input('to', sql.Int, assignedTo);
        request.input('by', sql.Int, assignedBy || null);
        request.input('prio', sql.NVarChar, priority || 'Medium');
        request.input('due', sql.DateTime, dueDate || null);
        request.input('cust', sql.Int, customerId || null);
        request.input('leadId', sql.Int, leadId || null);

        let relatedTo = null;
        if (leadId) {
            relatedTo = 'Lead';
        } else if (customerId) {
            relatedTo = 'Customer';
        }
        request.input('relTo', sql.NVarChar, relatedTo);
        request.input('notes', sql.NVarChar, notes || null);

        // إضافة المهمة وجلب الـ ID
        const result = await request.query(`
            INSERT INTO tbl_Tasks 
            (Title, Description, AssignedTo, AssignedBy, Priority, DueDate, RelatedTo, RelatedID, CustomerID, Notes, Status, CreatedAt)
            OUTPUT INSERTED.TaskID
            VALUES 
            (@title, @desc, @to, @by, @prio, @due, @relTo, @leadId, @cust, @notes, 'Pending', GETDATE())
        `);

        const taskId = result.recordset[0].TaskID;

        // ✅ جلب UserId من EmpID
        const userId = await getUserIdByEmpId(assignedTo);
        
        // ✅ لو الموظف عنده حساب، نبعتله إشعار
        if (userId) {
            await createAndPushNotification(
                userId,  // ✅ UserId مش EmpID
                '📋 مهمة جديدة', 
                `تم تكليفك بمهمة: ${title}`, 
                'Task',
                'Task',
                taskId
            );
        }

        res.status(201).json({ message: 'تم إسناد المهمة بنجاح ✅', taskId });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في إنشاء المهمة', error: err.message });
    }
};

// 2. عرض مهام موظف معيّن
const getMyTasks = async (req, res) => {
    const { empId } = req.params;
    const { status } = req.query;

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
                cu.FullName       AS CustomerName,
                ch.FullNameArabic AS ChildName,
                l.FullName        AS LeadName
            FROM tbl_Tasks t
            LEFT JOIN tbl_Customers cu 
                ON t.CustomerID = cu.CustomerID
            LEFT JOIN tbl_Child ch 
                ON cu.ChildID = ch.ID_Child
            LEFT JOIN tbl_Leads l 
                ON t.RelatedTo = 'Lead' 
               AND t.RelatedID = l.LeadID
            WHERE t.AssignedTo = @id
              AND t.IsDeleted = 0
        `;

        if (status) {
            request.input('stat', sql.NVarChar, status);
            query += ' AND t.Status = @stat';
        }

        query += ' ORDER BY t.DueDate ASC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// 3. تحديث حالة المهمة
const updateTaskStatus = async (req, res) => {
    const { taskId } = req.params;
    const { status, notes } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, taskId);
        request.input('stat', sql.NVarChar, status);
        request.input('notes', sql.NVarChar, notes || '');

        // جلب بيانات المهمة قبل التحديث
        const taskResult = await request.query(`
            SELECT Title, AssignedBy FROM tbl_Tasks WHERE TaskID = @id
        `);

        await request.query(`
            UPDATE tbl_Tasks 
            SET Status = @stat, 
                Notes = CASE 
                            WHEN @notes IS NULL OR @notes = '' 
                            THEN Notes 
                            ELSE ISNULL(Notes, '') + ' | ' + @notes 
                        END,
                CompletedDate = CASE WHEN @stat = 'Completed' THEN GETDATE() ELSE CompletedDate END,
                UpdatedAt = GETDATE()
            WHERE TaskID = @id
        `);

        // ✅ إشعار للمدير لما المهمة تكتمل
        // AssignedBy = UserId (جاي من Flutter) ✅ صح
        if (status === 'Completed' && taskResult.recordset.length > 0) {
            const task = taskResult.recordset[0];
            if (task.AssignedBy) {
                await createAndPushNotification(
                    task.AssignedBy,  // ✅ ده UserId أصلاً
                    '✅ مهمة مكتملة',
                    `تم إنجاز المهمة: ${task.Title}`,
                    'Task',
                    'Task',
                    parseInt(taskId)
                );
            }
        }

        res.status(200).json({ message: 'تم تحديث حالة المهمة بنجاح 🔄' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. حذف مهمة (Soft Delete)
const deleteTask = async (req, res) => {
    const { taskId } = req.params;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, taskId);

        // جلب بيانات المهمة قبل الحذف
        const taskResult = await request.query(`
            SELECT Title, AssignedTo FROM tbl_Tasks WHERE TaskID = @id
        `);

        await request.query(`
            UPDATE tbl_Tasks 
            SET IsDeleted = 1, UpdatedAt = GETDATE()
            WHERE TaskID = @id
        `);

        // ✅ إشعار للموظف بحذف المهمة
        if (taskResult.recordset.length > 0) {
            const task = taskResult.recordset[0];
            
            // ✅ جلب UserId من EmpID
            const userId = await getUserIdByEmpId(task.AssignedTo);
            
            if (userId) {
                await createAndPushNotification(
                    userId,  // ✅ UserId مش EmpID
                    '🗑️ تم حذف مهمة',
                    `تم حذف المهمة: ${task.Title}`,
                    'Task',
                    'Task',
                    parseInt(taskId)
                );
            }
        }

        res.status(200).json({ message: 'تم حذف المهمة ✅' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    createTask,
    getMyTasks,
    updateTaskStatus,
    deleteTask
};