const { sql } = require('../config/db');

// 1. جلب إشعارات المستخدم (غير المقروءة أولاً)
const getMyNotifications = async (req, res) => {
    const { userId } = req.params;

    try {
        const result = await sql.query(`
            SELECT NotificationID, Title, Message, IsRead, CreatedAt 
            FROM tbl_Notifications 
            WHERE UserID = ${userId} AND IsDeleted = 0
            ORDER BY IsRead ASC, CreatedAt DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. تعليم الإشعار كمقروء
const markAsRead = async (req, res) => {
    const { id } = req.params; // Notification ID

    try {
        await sql.query(`
            UPDATE tbl_Notifications 
            SET IsRead = 1, ReadAt = GETDATE() 
            WHERE NotificationID = ${id}
        `);
        res.status(200).json({ message: 'تم قراءة الإشعار ☑️' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. (داخلي) دالة مساعدة لإرسال إشعار (هنستخدمها جوه الكود مش من الرابط)
const createSystemNotification = async (userId, title, message, type) => {
    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, userId);
        request.input('title', sql.NVarChar, title);
        request.input('msg', sql.NVarChar, message);
        request.input('type', sql.NVarChar, type || 'System');

        await request.query(`
            INSERT INTO tbl_Notifications (UserID, Title, Message, NotificationType, IsRead, CreatedAt, IsDeleted)
            VALUES (@uid, @title, @msg, @type, 0, GETDATE(), 0)
        `);
    } catch (err) {
        console.error('Notification Error:', err);
    }
};

// دالة تجريبية لإرسال إشعار يدوي (للاختبار فقط)
const testSendNotification = async (req, res) => {
    const { userId, message } = req.body;
    try {
        await createSystemNotification(userId, 'تجربة', message, 'Test');
        res.status(200).json({ message: 'تمت محاولة الإرسال 📨' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { 
    getMyNotifications, 
    markAsRead, 
    createSystemNotification, 
    testSendNotification // ⬅️ جديد
};