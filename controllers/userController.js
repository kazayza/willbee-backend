const { sql } = require('../config/db');

// ═══════════════════════════════════════════════════════════════════════════
// 🔑 دالة تسجيل الدخول
// ═══════════════════════════════════════════════════════════════════════════
const loginUser = async (req, res) => {
    const { UserName, Password } = req.body;

    try {
        const request = new sql.Request();
        request.input('user', sql.VarChar, UserName);
        request.input('pass', sql.VarChar, Password);

        // 1️⃣ التحقق من بيانات المستخدم + EmpID
        const userResult = await request.query(`
            SELECT UserId, FullName, Role, permision, EmpID
            FROM tbl_users 
            WHERE UserName = @user AND Password = @pass
        `);

        if (userResult.recordset.length > 0) {
            const user = userResult.recordset[0];

            // 2️⃣ جلب الصلاحيات التفصيلية لهذا المستخدم
            const permRequest = new sql.Request();
            permRequest.input('uid', sql.Int, user.UserId);

            const permissionsResult = await permRequest.query(`
                SELECT fname, canAdd, canEdit, canDelete, canview, canOpen
                FROM tbl_usercontrol 
                WHERE userCode = @uid
            `);

            res.status(200).json({
                message: 'تم تسجيل الدخول بنجاح ✅',
                user: user,
                permissions: permissionsResult.recordset
            });

        } else {
            res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة ❌' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في السيرفر', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔒 دالة جلب صلاحيات المستخدم
// ═══════════════════════════════════════════════════════════════════════════
const getUserPermissions = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, id);

        const result = await request.query(`
            SELECT fname, canAdd, canEdit, canDelete, canview, canOpen
            FROM tbl_usercontrol 
            WHERE userCode = @uid
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔐 دالة تغيير كلمة المرور
// ═══════════════════════════════════════════════════════════════════════════
const changePassword = async (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;

    // التحقق من وجود البيانات المطلوبة
    if (!userId || !currentPassword || !newPassword) {
        return res.status(400).json({ 
            success: false, 
            message: 'جميع الحقول مطلوبة' 
        });
    }

    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, userId);
        request.input('currentPass', sql.VarChar, currentPassword);

        // 1️⃣ التحقق من كلمة المرور الحالية
        const checkResult = await request.query(`
            SELECT UserId FROM tbl_users 
            WHERE UserId = @uid AND Password = @currentPass
        `);

        if (checkResult.recordset.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'كلمة المرور الحالية غير صحيحة' 
            });
        }

        // 2️⃣ تحديث كلمة المرور الجديدة
        const updateRequest = new sql.Request();
        updateRequest.input('uid', sql.Int, userId);
        updateRequest.input('newPass', sql.VarChar, newPassword);

        await updateRequest.query(`
            UPDATE tbl_users 
            SET Password = @newPass 
            WHERE UserId = @uid
        `);

        res.status(200).json({ 
            success: true, 
            message: 'تم تغيير كلمة المرور بنجاح ✅' 
        });

    } catch (err) {
        console.error('Change Password Error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في السيرفر', 
            error: err.message 
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📱 دالة تحديث FCM Token
// ═══════════════════════════════════════════════════════════════════════════
const updateFcmToken = async (req, res) => {
    const { userId, fcmToken } = req.body;

    if (!userId || !fcmToken) {
        return res.status(400).json({ 
            success: false, 
            message: 'userId و fcmToken مطلوبين' 
        });
    }

    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, userId);
        request.input('token', sql.VarChar(500), fcmToken);

        await request.query(`
            UPDATE tbl_users 
            SET fcm_token = @token 
            WHERE UserId = @uid
        `);

        res.status(200).json({ 
            success: true, 
            message: 'تم تحديث FCM Token بنجاح ✅' 
        });

    } catch (err) {
        console.error('Update FCM Token Error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في السيرفر', 
            error: err.message 
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔔 دالة إرسال إشعار لمستخدم معين
// ═══════════════════════════════════════════════════════════════════════════
const sendNotificationToUser = async (req, res) => {
    const { userId, title, body } = req.body;

    if (!userId || !title || !body) {
        return res.status(400).json({ 
            success: false, 
            message: 'userId, title, body مطلوبين' 
        });
    }

    try {
        // 1️⃣ جلب FCM Token للمستخدم
        const request = new sql.Request();
        request.input('uid', sql.Int, userId);

        const result = await request.query(`
            SELECT fcm_token FROM tbl_users WHERE UserId = @uid
        `);

        if (result.recordset.length === 0 || !result.recordset[0].fcm_token) {
            return res.status(404).json({ 
                success: false, 
                message: 'المستخدم غير موجود أو لا يملك FCM Token' 
            });
        }

        const fcmToken = result.recordset[0].fcm_token;

        // 2️⃣ إرسال الإشعار عبر Firebase
        const admin = require('firebase-admin');
        
        const message = {
            notification: {
                title: title,
                body: body,
            },
            token: fcmToken,
        };

        const response = await admin.messaging().send(message);
        
        res.status(200).json({ 
            success: true, 
            message: 'تم إرسال الإشعار بنجاح ✅',
            response: response
        });

    } catch (err) {
        console.error('Send Notification Error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في إرسال الإشعار', 
            error: err.message 
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📢 دالة إرسال إشعار لجميع المستخدمين
// ═══════════════════════════════════════════════════════════════════════════
const sendNotificationToAll = async (req, res) => {
    const { title, body } = req.body;

    if (!title || !body) {
        return res.status(400).json({ 
            success: false, 
            message: 'title و body مطلوبين' 
        });
    }

    try {
        // 1️⃣ جلب كل FCM Tokens
        const request = new sql.Request();

        const result = await request.query(`
            SELECT fcm_token FROM tbl_users 
            WHERE fcm_token IS NOT NULL AND fcm_token != ''
        `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'لا يوجد مستخدمين لديهم FCM Token' 
            });
        }

        // 2️⃣ إرسال الإشعارات لكل المستخدمين
        const admin = require('firebase-admin');
        const tokens = result.recordset.map(row => row.fcm_token);

        const message = {
            notification: {
                title: title,
                body: body,
            },
            tokens: tokens, // إرسال لعدة أجهزة
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        
        res.status(200).json({ 
            success: true, 
            message: `تم إرسال الإشعار بنجاح ✅`,
            successCount: response.successCount,
            failureCount: response.failureCount
        });

    } catch (err) {
        console.error('Send Notification to All Error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في إرسال الإشعارات', 
            error: err.message 
        });
    }
};

module.exports = {
    loginUser,
    getUserPermissions,
    changePassword,
    updateFcmToken,
    sendNotificationToUser,
    sendNotificationToAll
};