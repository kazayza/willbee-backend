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

        // ✅ إضافة المهمة بتوقيت مصر
        const result = await request.query(`
            INSERT INTO tbl_Tasks 
            (Title, Description, AssignedTo, AssignedBy, Priority, DueDate, RelatedTo, RelatedID, CustomerID, Notes, Status, CreatedAt)
            OUTPUT INSERTED.TaskID
            VALUES 
            (@title, @desc, @to, @by, @prio, @due, @relTo, @leadId, @cust, @notes, 'Pending', 
            ${EGYPT_TIME})
        `);

        const taskId = result.recordset[0].TaskID;

        const userId = await getUserIdByEmpId(assignedTo);
        
        if (userId) {
            await createAndPushNotification(
                userId,
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

        const taskResult = await request.query(`
            SELECT Title, AssignedBy FROM tbl_Tasks WHERE TaskID = @id
        `);

        // ✅ تحديث بتوقيت مصر
        await request.query(`
            UPDATE tbl_Tasks 
            SET Status = @stat, 
                Notes = CASE 
                            WHEN @notes IS NULL OR @notes = '' 
                            THEN Notes 
                            ELSE ISNULL(Notes, '') + ' | ' + @notes 
                        END,
                CompletedDate = CASE WHEN @stat = 'Completed' THEN ${EGYPT_TIME} ELSE CompletedDate END,
                UpdatedAt = ${EGYPT_TIME}
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

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, taskId);

        const taskResult = await request.query(`
            SELECT Title, AssignedTo FROM tbl_Tasks WHERE TaskID = @id
        `);

        // ✅ حذف بتوقيت مصر
        await request.query(`
            UPDATE tbl_Tasks 
            SET IsDeleted = 1, UpdatedAt = ${EGYPT_TIME}
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

module.exports = {
    createTask,
    getMyTasks,
    updateTaskStatus,
    deleteTask
};