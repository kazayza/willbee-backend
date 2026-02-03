const { sql } = require('../config/db');
const { createAndPushNotification } = require('./notificationController');

// ✅ توقيت مصر
const EGYPT_TIME = "GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Egypt Standard Time'";

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
        assignedTo,
        assignedBy,
        priority,
        dueDate,
        customerId,
        leadId,
        notes,
        userAdd,
        clientTime
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('title', sql.NVarChar, title);
        request.input('desc', sql.NVarChar, description || null);
        request.input('to', sql.Int, assignedTo);
        request.input('by', sql.Int, assignedBy || null);
        request.input('prio', sql.NVarChar, priority || 'Medium');
        request.input('due', sql.DateTime, dueDate ? new Date(dueDate) : null);
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
        request.input('userAdd', sql.VarChar, userAdd || null);
        request.input('addTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            INSERT INTO tbl_Tasks 
            (
                Title, 
                Description, 
                AssignedTo, 
                AssignedBy, 
                Priority, 
                DueDate, 
                RelatedTo, 
                RelatedID, 
                CustomerID, 
                Notes, 
                Status, 
                CreatedAt,
                userAdd,
                Addtime
            )
            OUTPUT INSERTED.TaskID
            VALUES 
            (
                @title, 
                @desc, 
                @to, 
                @by, 
                @prio, 
                @due, 
                @relTo, 
                @leadId, 
                @cust, 
                @notes, 
                'Pending', 
                @addTime,
                @userAdd,
                @addTime
            )
        `);

        const taskId = result.recordset[0].TaskID;

        const userId = await getUserIdByEmpId(assignedTo);
        
        if (userId) {
    // جلب اسم المُرسل
    const senderRequest = new sql.Request();
    senderRequest.input('senderId', sql.Int, assignedBy);
    
    const senderResult = await senderRequest.query(`
        SELECT FullName FROM tbl_users WHERE UserId = @senderId
    `);
    
    const senderName = senderResult.recordset.length > 0 
        ? senderResult.recordset[0].FullName 
        : '';
    
    const notificationBody = senderName 
        ? `تم تكليفك بمهمة: ${title} من: ${senderName}`
        : `تم تكليفك بمهمة: ${title}`;
    
    await createAndPushNotification(
        userId,
        '📋 مهمة جديدة', 
        notificationBody, 
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
                t.CreatedAt,
                t.AssignedBy,
                t.userAdd,
                t.Addtime,
                t.useredit,
                t.editTime,
                cu.FullName       AS CustomerName,
                ch.FullNameArabic AS ChildName,
                l.FullName        AS LeadName,
                u.FullName        AS AssignedByName
            FROM tbl_Tasks t
            LEFT JOIN tbl_Customers cu 
                ON t.CustomerID = cu.CustomerID
            LEFT JOIN tbl_Child ch 
                ON cu.ChildID = ch.ID_Child
            LEFT JOIN tbl_Leads l 
                ON t.RelatedTo = 'Lead' 
               AND t.RelatedID = l.LeadID
            LEFT JOIN tbl_users u
                ON t.AssignedBy = u.UserId
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
    const { status, notes, useredit, clientTime } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, taskId);
        request.input('stat', sql.NVarChar, status);
        request.input('notes', sql.NVarChar, notes || '');
        request.input('useredit', sql.VarChar, useredit || null);
        request.input('editTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

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
                CompletedDate = CASE WHEN @stat = 'Completed' THEN @editTime ELSE CompletedDate END,
                UpdatedAt = @editTime,
                useredit = @useredit,
                editTime = @editTime
            WHERE TaskID = @id
        `);

        if (status === 'Completed' && taskResult.recordset.length > 0) {
            const task = taskResult.recordset[0];
            if (task.AssignedBy) {
                await createAndPushNotification(
                    task.AssignedBy,
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
    const { useredit, clientTime } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, taskId);
        request.input('useredit', sql.VarChar, useredit || null);
        request.input('editTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const taskResult = await request.query(`
            SELECT Title, AssignedTo FROM tbl_Tasks WHERE TaskID = @id
        `);

        await request.query(`
            UPDATE tbl_Tasks 
            SET IsDeleted = 1, 
                UpdatedAt = @editTime,
                useredit = @useredit,
                editTime = @editTime
            WHERE TaskID = @id
        `);

        if (taskResult.recordset.length > 0) {
            const task = taskResult.recordset[0];
            
            const userId = await getUserIdByEmpId(task.AssignedTo);
            
            if (userId) {
                await createAndPushNotification(
                    userId,
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

// ✅ جلب عدد المهام لـ Lead معين
const getLeadTasksCount = async (req, res) => {
    const { leadId } = req.params;

    try {
        const request = new sql.Request();
        request.input('leadId', sql.Int, leadId);

        const result = await request.query(`
            SELECT COUNT(*) AS TasksCount
            FROM tbl_Tasks
            WHERE RelatedTo = 'Lead' 
              AND RelatedID = @leadId 
              AND IsDeleted = 0
        `);

        res.status(200).json({ 
            count: result.recordset[0].TasksCount 
        });

    } catch (err) {
        console.error('getLeadTasksCount error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ جلب المهام التي أرسلتها (للأدمن أو أي يوزر)
const getTasksSentByMe = async (req, res) => {
    const { userId } = req.params;
    const { status } = req.query;

    try {
        const request = new sql.Request();
        request.input('userId', sql.Int, userId);

        let query = `
            SELECT 
                t.TaskID,
                t.Title,
                t.Description,
                t.Priority,
                t.Status,
                t.DueDate,
                t.Notes,
                t.CreatedAt,
                t.AssignedBy,
                t.userAdd,
                t.Addtime,
                t.useredit,
                t.editTime,
                cu.FullName       AS CustomerName,
                ch.FullNameArabic AS ChildName,
                l.FullName        AS LeadName,
                e.empName         AS AssignedToName
            FROM tbl_Tasks t
            LEFT JOIN tbl_Customers cu 
                ON t.CustomerID = cu.CustomerID
            LEFT JOIN tbl_Child ch 
                ON cu.ChildID = ch.ID_Child
            LEFT JOIN tbl_Leads l 
                ON t.RelatedTo = 'Lead' 
               AND t.RelatedID = l.LeadID
            LEFT JOIN tbl_empolyee e
                ON t.AssignedTo = e.ID
            WHERE t.AssignedBy = @userId
              AND t.IsDeleted = 0
        `;

        if (status) {
            request.input('stat', sql.NVarChar, status);
            query += ' AND t.Status = @stat';
        }

        query += ' ORDER BY t.CreatedAt DESC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 💬 إضافة رد على مهمة
// ═══════════════════════════════════════════════════════════════════════════
const addTaskReply = async (req, res) => {
    const { taskId } = req.params;
    const { userId, message } = req.body;

    if (!message || !message.trim()) {
        return res.status(400).json({ 
            success: false, 
            message: 'الرسالة مطلوبة' 
        });
    }

    try {
        const request = new sql.Request();
        request.input('taskId', sql.Int, taskId);
        request.input('userId', sql.Int, userId);
        request.input('message', sql.NVarChar, message.trim());

        // 1️⃣ إضافة الرد
        const result = await request.query(`
            INSERT INTO tbl_TaskReplies (TaskID, UserID, Message, CreatedAt, IsDeleted)
            OUTPUT INSERTED.ReplyID
            VALUES (@taskId, @userId, @message, GETUTCDATE(), 0)
        `);

        const replyId = result.recordset[0].ReplyID;

        // 2️⃣ جلب بيانات المهمة والمُرسل
        const taskRequest = new sql.Request();
        taskRequest.input('taskId', sql.Int, taskId);

        const taskResult = await taskRequest.query(`
            SELECT t.Title, t.AssignedBy, t.AssignedTo, u.FullName as SenderName
            FROM tbl_Tasks t
            LEFT JOIN tbl_users u ON u.UserId = @userId
            WHERE t.TaskID = @taskId
        `);

        if (taskResult.recordset.length > 0) {
            const task = taskResult.recordset[0];
            
            // 3️⃣ جلب اسم الراد
            const replyUserRequest = new sql.Request();
            replyUserRequest.input('userId', sql.Int, userId);
            
            const replyUserResult = await replyUserRequest.query(`
                SELECT FullName FROM tbl_users WHERE UserId = @userId
            `);
            
            const replyUserName = replyUserResult.recordset.length > 0 
                ? replyUserResult.recordset[0].FullName 
                : 'موظف';

            // 4️⃣ تحديد مين يستلم الإشعار
            let notifyUserId = null;
            
            // لو الراد هو المُكلف بالمهمة، نبعت للمُرسل
            const assignedToUserId = await getUserIdByEmpId(task.AssignedTo);
            
            if (userId === assignedToUserId) {
                // الموظف رد، نبعت للمُرسل
                notifyUserId = task.AssignedBy;
            } else if (userId === task.AssignedBy) {
                // المُرسل رد، نبعت للموظف
                notifyUserId = assignedToUserId;
            }

            // 5️⃣ إرسال إشعار
            if (notifyUserId) {
                await createAndPushNotification(
                    notifyUserId,
                    '💬 رد جديد على مهمة',
                    `${replyUserName}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
                    'TaskReply',
                    'Task',
                    parseInt(taskId)
                );
            }
        }

        res.status(201).json({ 
            success: true, 
            message: 'تم إرسال الرد بنجاح ✅',
            replyId: replyId
        });

    } catch (err) {
        console.error('addTaskReply error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في إرسال الرد', 
            error: err.message 
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 💬 جلب ردود مهمة معينة
// ═══════════════════════════════════════════════════════════════════════════
const getTaskReplies = async (req, res) => {
    const { taskId } = req.params;

    try {
        const request = new sql.Request();
        request.input('taskId', sql.Int, taskId);

        const result = await request.query(`
            SELECT 
                r.ReplyID,
                r.TaskID,
                r.UserID,
                r.Message,
                r.CreatedAt,
                u.FullName as UserName
            FROM tbl_TaskReplies r
            LEFT JOIN tbl_users u ON r.UserID = u.UserId
            WHERE r.TaskID = @taskId AND r.IsDeleted = 0
            ORDER BY r.CreatedAt ASC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('getTaskReplies error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// ✅ تعليم المهمة كمقروءة
// ═══════════════════════════════════════════════════════════════════════════
const markTaskAsRead = async (req, res) => {
    const { taskId } = req.params;
    const { userId } = req.body;

    try {
        const request = new sql.Request();
        request.input('taskId', sql.Int, taskId);
        request.input('userId', sql.Int, userId);

        // تحديث حالة القراءة
        await request.query(`
            UPDATE tbl_Tasks 
            SET IsRead = 1, ReadAt = GETDATE(), ReadBy = @userId
            WHERE TaskID = @taskId
        `);

        // جلب بيانات المهمة
        const taskResult = await request.query(`
            SELECT t.Title, t.AssignedBy, u.FullName as ReaderName
            FROM tbl_Tasks t
            LEFT JOIN tbl_users u ON u.UserId = @userId
            WHERE t.TaskID = @taskId
        `);

        if (taskResult.recordset.length > 0) {
            const task = taskResult.recordset[0];
            const readerName = task.ReaderName || 'الموظف';

            // إرسال إشعار للمُرسل
            if (task.AssignedBy) {
                await createAndPushNotification(
                    task.AssignedBy,
                    '👁️ تم قراءة المهمة',
                    `${readerName} شاف المهمة: ${task.Title}`,
                    'TaskRead',
                    'Task',
                    parseInt(taskId)
                );
            }
        }

        res.status(200).json({ 
            success: true, 
            message: 'تم تعليم المهمة كمقروءة ✅' 
        });

    } catch (err) {
        console.error('markTaskAsRead error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في تحديث حالة القراءة', 
            error: err.message 
        });
    }
};

module.exports = {
    createTask,
    getMyTasks,
    getTasksSentByMe,
    updateTaskStatus,
    deleteTask,
    getLeadTasksCount,
    addTaskReply,      // ✅ جديد
    getTaskReplies,    // ✅ جديد
    markTaskAsRead     // ✅ جديد
};