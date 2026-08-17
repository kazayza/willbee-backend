const { sql } = require('../config/db');

// 1. عرض سجل المراقبة (Audit Log) - للمدير فقط
const getAuditLogs = async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT TOP 100 * FROM tbl_AuditLog 
            ORDER BY Timestamp DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. تسجيل حركة يدوية (Log Action) - بنناديها من الفرونت
const logAction = async (req, res) => {
    const { userId, action, table, recordId, details } = req.body;

    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, userId);
        request.input('act', sql.NVarChar, action); // Create, Update, Delete
        request.input('tbl', sql.NVarChar, table);
        request.input('rec', sql.Int, recordId);
        request.input('det', sql.NVarChar, details); // New Values

        await request.query(`
            INSERT INTO tbl_AuditLog (UserID, ActionType, TableName, RecordID, NewValues, Timestamp)
            VALUES (@uid, @act, @tbl, @rec, @det, GETDATE())
        `);
        res.status(201).json({ message: 'Logged' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. جلب أسماء الشاشات (Forms) - عشان شاشة الصلاحيات
const getFormNames = async (req, res) => {
    try {
        const result = await sql.query('SELECT * FROM tbl_FormName ORDER BY seq ASC');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. جلب الإدارات مع عدد الموظفين النشطين 🆕
const getManagementsWithCount = async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT 
                M.managementID,
                M.ManagmentName,
                COUNT(E.ID) AS ActiveEmployeesCount
            FROM tbl_Managment M
            LEFT JOIN tbl_empolyee E 
                ON E.empIDmangment = M.managementID 
                AND E.empstatus = 1
            GROUP BY M.managementID, M.ManagmentName
            ORDER BY M.ManagmentName ASC
        `);
        res.status(200).json({
            success: true,
            data: result.recordset
        });
    } catch (err) {
        console.error('getManagementsWithCount error:', err);
        res.status(500).json({ error: err.message });
    }
};

// 5. إرسال إشعار حسب الصلاحية (Role) 🆕
const sendNotificationByRole = async (req, res) => {
    const { role, title, message } = req.body;

    if (!role || !title || !message) {
        return res.status(400).json({ success: false, message: 'role و title و message مطلوبين' });
    }

    try {
        const request = new sql.Request();
        request.input('role', sql.VarChar, role);

        // جلب المستخدمين اللي ليهم الصلاحية دي وعندهم fcm_token
        const usersResult = await request.query(`
            SELECT UserId, fcm_token, FullName
            FROM tbl_users 
            WHERE Role = @role
              AND fcm_token IS NOT NULL 
              AND fcm_token != ''
        `);

        if (usersResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: `لا يوجد مستخدمين بصلاحية "${role}" أو لا يملكون FCM Token`
            });
        }

        // حفظ الإشعار لكل مستخدم + إرسال push
        const admin = require('firebase-admin');
        const tokens = [];
        const EGYPT_TIME = "GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Egypt Standard Time'";

        for (const user of usersResult.recordset) {
            const insReq = new sql.Request();
            insReq.input('uid', sql.Int, user.UserId);
            insReq.input('title', sql.NVarChar, title);
            insReq.input('msg', sql.NVarChar, message);
            insReq.input('type', sql.NVarChar, 'AdminBroadcast');
            insReq.input('role', sql.VarChar, role);

            await insReq.query(`
                INSERT INTO tbl_Notifications 
                (UserID, Title, Message, NotificationType, IsRead, CreatedAt, IsDeleted)
                VALUES (@uid, @title, @msg, @type, 0, ${EGYPT_TIME}, 0)
            `);

            if (user.fcm_token) tokens.push(user.fcm_token);
        }

        // إرسال push
        if (tokens.length > 0) {
            const fcmMessage = {
                notification: { title: title, body: message },
                tokens: tokens,
            };
            const response = await admin.messaging().sendEachForMulticast(fcmMessage);
            
            res.status(200).json({
                success: true,
                message: `تم الإرسال بنجاح`,
                successCount: response.successCount,
                failureCount: response.failureCount
            });
        } else {
            res.status(200).json({
                success: true,
                message: 'تم حفظ الإشعارات لكن لا يوجد FCM Tokens'
            });
        }

    } catch (err) {
        console.error('sendNotificationByRole error:', err);
        res.status(500).json({ success: false, message: 'خطأ في الإرسال', error: err.message });
    }
};

// 6. جلب كل المستخدمين (لشاشة إرسال الإشعارات) 🆕
const getAllUsersForNotification = async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT UserId, UserName, FullName, Role, fcm_token
            FROM tbl_users
            ORDER BY FullName ASC
        `);
        res.status(200).json({
            success: true,
            data: result.recordset
        });
    } catch (err) {
        console.error('getAllUsersForNotification error:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { getAuditLogs, logAction, getFormNames, getManagementsWithCount, sendNotificationByRole, getAllUsersForNotification };