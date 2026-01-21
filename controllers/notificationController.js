const { sql } = require('../config/db');
const admin = require('firebase-admin');

// ═══════════════════════════════════════════════════════════════════════════
// 🔔 دالة إنشاء إشعار + إرسال Push Notification
// ═══════════════════════════════════════════════════════════════════════════
const createAndPushNotification = async (userId, title, message, type, relatedTo = null, relatedId = null) => {
    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, userId);
        request.input('title', sql.NVarChar, title);
        request.input('msg', sql.NVarChar, message);
        request.input('type', sql.NVarChar, type || 'System');
        request.input('relTo', sql.NVarChar, relatedTo);
        request.input('relId', sql.Int, relatedId);

        // 1️⃣ حفظ الإشعار في الداتابيز
        await request.query(`
            INSERT INTO tbl_Notifications 
            (UserID, Title, Message, NotificationType, RelatedTo, RelatedID, IsRead, CreatedAt, IsDeleted)
            VALUES (@uid, @title, @msg, @type, @relTo, @relId, 0, GETDATE(), 0)
        `);

        // 2️⃣ جلب FCM Token للمستخدم
        const tokenRequest = new sql.Request();
        tokenRequest.input('uid', sql.Int, userId);
        
        const tokenResult = await tokenRequest.query(`
            SELECT fcm_token FROM tbl_users WHERE UserId = @uid
        `);

        // 3️⃣ إرسال Push Notification لو الـ Token موجود
        if (tokenResult.recordset.length > 0 && tokenResult.recordset[0].fcm_token) {
            const fcmToken = tokenResult.recordset[0].fcm_token;
            
            const fcmMessage = {
                notification: {
                    title: title,
                    body: message,
                },
                data: {
                    type: type || 'System',
                    relatedTo: relatedTo || '',
                    relatedId: relatedId ? relatedId.toString() : '',
                },
                token: fcmToken,
            };

            await admin.messaging().send(fcmMessage);
            console.log(`✅ Push sent to user ${userId}`);
        }

    } catch (err) {
        console.error('❌ Notification Error:', err);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📢 دالة إرسال إشعار للجميع + حفظ في الداتابيز
// ═══════════════════════════════════════════════════════════════════════════
const createAndPushToAll = async (title, message, type) => {
    try {
        const request = new sql.Request();

        // 1️⃣ جلب كل المستخدمين
        const usersResult = await request.query(`
            SELECT UserId, fcm_token FROM tbl_users 
            WHERE fcm_token IS NOT NULL AND fcm_token != ''
        `);

        if (usersResult.recordset.length === 0) {
            console.log('No users with FCM tokens');
            return;
        }

        const tokens = [];

        // 2️⃣ حفظ إشعار لكل مستخدم في الداتابيز
        for (const user of usersResult.recordset) {
            const insertRequest = new sql.Request();
            insertRequest.input('uid', sql.Int, user.UserId);
            insertRequest.input('title', sql.NVarChar, title);
            insertRequest.input('msg', sql.NVarChar, message);
            insertRequest.input('type', sql.NVarChar, type || 'System');

            await insertRequest.query(`
                INSERT INTO tbl_Notifications 
                (UserID, Title, Message, NotificationType, IsRead, CreatedAt, IsDeleted)
                VALUES (@uid, @title, @msg, @type, 0, GETDATE(), 0)
            `);

            if (user.fcm_token) {
                tokens.push(user.fcm_token);
            }
        }

        // 3️⃣ إرسال Push Notification للكل
        if (tokens.length > 0) {
            const fcmMessage = {
                notification: {
                    title: title,
                    body: message,
                },
                tokens: tokens,
            };

            const response = await admin.messaging().sendEachForMulticast(fcmMessage);
            console.log(`✅ Push sent to ${response.successCount} users`);
        }

    } catch (err) {
        console.error('❌ Broadcast Notification Error:', err);
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📋 جلب إشعارات المستخدم
// ═══════════════════════════════════════════════════════════════════════════
const getMyNotifications = async (req, res) => {
    const { userId } = req.params;

    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, userId);

        const result = await request.query(`
            SELECT NotificationID, Title, Message, NotificationType, IsRead, 
                   RelatedTo, RelatedID, CreatedAt 
            FROM tbl_Notifications 
            WHERE UserID = @uid AND IsDeleted = 0
            ORDER BY IsRead ASC, CreatedAt DESC
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// ✅ تعليم الإشعار كمقروء
// ═══════════════════════════════════════════════════════════════════════════
const markAsRead = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);

        await request.query(`
            UPDATE tbl_Notifications 
            SET IsRead = 1, ReadAt = GETDATE() 
            WHERE NotificationID = @id
        `);
        res.status(200).json({ message: 'تم قراءة الإشعار ☑️' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// ✅ تعليم كل الإشعارات كمقروءة
// ═══════════════════════════════════════════════════════════════════════════
const markAllAsRead = async (req, res) => {
    const { userId } = req.params;

    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, userId);

        await request.query(`
            UPDATE tbl_Notifications 
            SET IsRead = 1, ReadAt = GETDATE() 
            WHERE UserID = @uid AND IsRead = 0
        `);
        res.status(200).json({ message: 'تم قراءة جميع الإشعارات ☑️' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📢 إرسال إشعار عام من الـ Admin (API)
// ═══════════════════════════════════════════════════════════════════════════
const sendBroadcastNotification = async (req, res) => {
    const { title, message, type } = req.body;

    if (!title || !message) {
        return res.status(400).json({ 
            success: false, 
            message: 'title و message مطلوبين' 
        });
    }

    try {
        await createAndPushToAll(title, message, type || 'Broadcast');
        
        res.status(200).json({ 
            success: true, 
            message: 'تم إرسال الإشعار للجميع ✅' 
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في إرسال الإشعار', 
            error: err.message 
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🆕 إشعار تحديث التطبيق
// ═══════════════════════════════════════════════════════════════════════════
const sendUpdateNotification = async (req, res) => {
    const { version, notes } = req.body;

    if (!version) {
        return res.status(400).json({ 
            success: false, 
            message: 'version مطلوب' 
        });
    }

    const title = '🚀 تحديث جديد متوفر';
    const message = `الإصدار ${version} متاح الآن. ${notes || 'تحسينات وإصلاحات.'}`;

    try {
        await createAndPushToAll(title, message, 'Update');
        
        res.status(200).json({ 
            success: true, 
            message: 'تم إرسال إشعار التحديث للجميع ✅' 
        });
    } catch (err) {
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في إرسال إشعار التحديث', 
            error: err.message 
        });
    }
};

module.exports = { 
    createAndPushNotification,
    createAndPushToAll,
    getMyNotifications, 
    markAsRead,
    markAllAsRead,
    sendBroadcastNotification,
    sendUpdateNotification
};