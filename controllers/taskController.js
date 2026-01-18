const { sql } = require('../config/db');
const { createSystemNotification } = require('./notificationController');

// 1. إنشاء مهمة جديدة (تدعم عميل أو Lead)
const createTask = async (req, res) => {
    const { 
        title, 
        description, 
        assignedTo,      // ID الموظف المسؤول
        assignedBy,      // ID اللي كلفه (اختياري)
        priority,        // High, Medium, Low
        dueDate,         // تاريخ الاستحقاق
        customerId,      // لو مرتبطة بولي أمر
        leadId,          // لو مرتبطة بـ Lead
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

        // RelatedTo: Lead / Customer / NULL
        let relatedTo = null;
        if (leadId) {
            relatedTo = 'Lead';
        } else if (customerId) {
            relatedTo = 'Customer';
        }
        request.input('relTo', sql.NVarChar, relatedTo);
        request.input('notes', sql.NVarChar, notes || null);

        await request.query(`
            INSERT INTO tbl_Tasks 
            (Title, Description, AssignedTo, AssignedBy, Priority, DueDate, RelatedTo, RelatedID, CustomerID, Notes, Status, CreatedAt)
            VALUES 
            (@title, @desc, @to, @by, @prio, @due, @relTo, @leadId, @cust, @notes, 'Pending', GETDATE())
        `);

        // إشعار سيستم داخلي (لو حابب، وإنت أصلاً كاتبه قبل كده)
        createSystemNotification(
            assignedTo, 
            'مهمة جديدة 📋', 
            `تم تكليفك بمهمة جديدة: ${title}`, 
            'Task'
        ).catch(err => console.error('Notification failed:', err));

        res.status(201).json({ message: 'تم إسناد المهمة بنجاح ✅' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في إنشاء المهمة', error: err.message });
    }
};

// 2. عرض مهام موظف معيّن (My Tasks)
const getMyTasks = async (req, res) => {
    const { empId } = req.params;   // ID الموظف (tbl_empolyee.ID)
    const { status } = req.query;   // فلتر اختياري بالحالة: Pending / Completed / ...

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

// 3. تحديث حالة المهمة (إنجاز المهمة)
const updateTaskStatus = async (req, res) => {
    const { taskId } = req.params;
    const { status, notes } = req.body; // Status: 'Completed', 'In Progress', ...

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, taskId);
        request.input('stat', sql.NVarChar, status);
        request.input('notes', sql.NVarChar, notes || '');

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