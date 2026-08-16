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

        // 1️⃣ التحقق من بيانات المستخدم + EmpID + نشط
        const userResult = await request.query(`
            SELECT UserId, FullName, Role, permision, EmpID, IsActive
            FROM tbl_users 
            WHERE UserName = @user AND Password = @pass
        `);

        if (userResult.recordset.length > 0) {
            const user = userResult.recordset[0];

            // ⛔ منع دخول المستخدم الموقوف (غير النشط)
            if (user.IsActive === false || user.IsActive === 0) {
                return res.status(403).json({ message: 'هذا الحساب موقوف، تواصل مع المدير' });
            }

            // 2️⃣ جلب الصلاحيات التفصيلية لهذا المستخدم
            const permRequest = new sql.Request();
            permRequest.input('uid', sql.Int, user.UserId);

            const permissionsResult = await permRequest.query(`
                SELECT fname, canAdd, canEdit, canDelete, canview, canOpen
                FROM tbl_usercontrol 
                WHERE userCode = @uid
            `);

            res.status(200).json({
                message: 'تم تسجيل الدخول بنجاح ',
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
            message: 'تم تغيير كلمة المرور بنجاح ' 
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
            message: 'تم تحديث FCM Token بنجاح ' 
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
            message: 'تم إرسال الإشعار بنجاح ',
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
            message: `تم إرسال الإشعار بنجاح `,
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
// ✅ جلب الموظفين المسؤولين عن العملاء (PRUser & HRUser فقط)
const getLeadsAssignees = async (req, res) => {
    try {
        const request = new sql.Request();

        const result = await request.query(`
            SELECT 
                u.EmpID,
                e.empName,
                u.Role,
                COUNT(l.LeadID) AS leadsCount
            FROM tbl_users u
            INNER JOIN tbl_empolyee e ON u.EmpID = e.ID
            LEFT JOIN tbl_Leads l ON l.AssignedTo = u.EmpID 
                AND l.IsDeleted = 0
            WHERE u.Role IN ('PRUser')
              AND u.EmpID IS NOT NULL
            GROUP BY u.EmpID, e.empName, u.Role
            ORDER BY e.empName ASC
        `);

        res.status(200).json({
            success: true,
            data: result.recordset
        });

    } catch (err) {
        console.error('getLeadsAssignees error:', err);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في جلب البيانات', 
            error: err.message 
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 👥 إدارة المستخدمين والصلاحيات
// ═══════════════════════════════════════════════════════════════════════════

// 📋 جلب كل المستخدمين
const getAllUsers = async (req, res) => {
    try {
        const request = new sql.Request();
        const result = await request.query(`
            SELECT 
                u.UserId,
                u.UserName,
                u.FullName,
                u.Mail,
                u.Role,
                u.EmpID,
                u.IsActive,
                e.empName
            FROM tbl_users u
            LEFT JOIN tbl_empolyee e ON u.EmpID = e.ID
            ORDER BY u.UserId DESC
        `);
        res.status(200).json({ success: true, data: result.recordset });
    } catch (err) {
        console.error('getAllUsers error:', err);
        res.status(500).json({ success: false, message: 'خطأ في جلب المستخدمين', error: err.message });
    }
};

// 📋 جلب قائمة الشاشات + الأدوار (لبناء مصفوفة الصلاحيات)
const getFormsAndRoles = async (req, res) => {
    try {
        const { FORMS, ROLES } = require('../config/forms');
        res.status(200).json({ success: true, forms: FORMS, roles: ROLES });
    } catch (err) {
        console.error('getFormsAndRoles error:', err);
        res.status(500).json({ success: false, message: 'خطأ في جلب الشاشات', error: err.message });
    }
};

// 🔍 جلب مستخدم واحد + صلاحياته
const getUserById = async (req, res) => {
    const { id } = req.params;
    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, id);

        const userResult = await request.query(`
            SELECT UserId, UserName, FullName, Mail, Role, EmpID, IsActive
            FROM tbl_users WHERE UserId = @uid
        `);

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

        const permRequest = new sql.Request();
        permRequest.input('uid', sql.Int, id);
        const permResult = await permRequest.query(`
            SELECT fname, canAdd, canEdit, canDelete, canview, canOpen
            FROM tbl_usercontrol WHERE userCode = @uid
        `);

        res.status(200).json({
            success: true,
            user: userResult.recordset[0],
            permissions: permResult.recordset
        });
    } catch (err) {
        console.error('getUserById error:', err);
        res.status(500).json({ success: false, message: 'خطأ في جلب المستخدم', error: err.message });
    }
};

// ➕ إنشاء مستخدم جديد + حفظ صلاحياته
const createUser = async (req, res) => {
    const { UserName, Password, FullName, Mail, Role, EmpID, IsActive, permissions } = req.body;

    if (!UserName || !Password) {
        return res.status(400).json({ success: false, message: 'اسم المستخدم وكلمة المرور مطلوبين' });
    }

    try {
        const request = new sql.Request();
        request.input('username', sql.VarChar, UserName);

        // 1️⃣ منع تكرار اسم المستخدم
        const check = await request.query(`SELECT UserId FROM tbl_users WHERE UserName = @username`);
        if (check.recordset.length > 0) {
            return res.status(400).json({ success: false, message: 'اسم المستخدم موجود بالفعل' });
        }

        // 2️⃣ إنشاء المستخدم
        const insertRequest = new sql.Request();
        insertRequest.input('username', sql.VarChar, UserName);
        insertRequest.input('pass', sql.VarChar, Password);
        insertRequest.input('fullname', sql.VarChar, FullName || null);
        insertRequest.input('mail', sql.VarChar, Mail || null);
        insertRequest.input('role', sql.VarChar, Role || null);
        insertRequest.input('empid', sql.Int, EmpID || null);
        insertRequest.input('isActive', sql.Bit, IsActive !== false ? 1 : 0);

        const insertResult = await insertRequest.query(`
            INSERT INTO tbl_users (UserName, Password, FullName, Mail, Role, EmpID, IsActive)
            OUTPUT INSERTED.UserId
            VALUES (@username, @pass, @fullname, @mail, @role, @empid, @isActive)
        `);

        const newUserId = insertResult.recordset[0].UserId;

        // 3️⃣ حفظ الصلاحيات
        await savePermissions(newUserId, permissions);

        res.status(201).json({
            success: true,
            message: 'تم إنشاء المستخدم بنجاح',
            userId: newUserId
        });
    } catch (err) {
        console.error('createUser error:', err);
        res.status(500).json({ success: false, message: 'خطأ في إنشاء المستخدم', error: err.message });
    }
};

// ✏️ تعديل مستخدم + تحديث صلاحياته
const updateUser = async (req, res) => {
    const { id } = req.params;
    const { UserName, Password, FullName, Mail, Role, EmpID, IsActive, permissions } = req.body;

    try {
        // 1️⃣ منع تكرار اسم المستخدم مع مستخدم آخر
        if (UserName) {
            const checkRequest = new sql.Request();
            checkRequest.input('username', sql.VarChar, UserName);
            checkRequest.input('uid', sql.Int, id);
            const check = await checkRequest.query(`
                SELECT UserId FROM tbl_users 
                WHERE UserName = @username AND UserId != @uid
            `);
            if (check.recordset.length > 0) {
                return res.status(400).json({ success: false, message: 'اسم المستخدم مستخدم بالفعل لمستخدم آخر' });
            }
        }

        // 2️⃣ تحديث بيانات المستخدم
        const updateRequest = new sql.Request();
        updateRequest.input('uid', sql.Int, id);
        updateRequest.input('username', sql.VarChar, UserName);
        updateRequest.input('fullname', sql.VarChar, FullName || null);
        updateRequest.input('mail', sql.VarChar, Mail || null);
        updateRequest.input('role', sql.VarChar, Role || null);
        updateRequest.input('empid', sql.Int, EmpID || null);
        updateRequest.input('isActive', sql.Bit, IsActive !== false ? 1 : 0);

        await updateRequest.query(`
            UPDATE tbl_users SET
                UserName = @username,
                FullName = @fullname,
                Mail = @mail,
                Role = @role,
                EmpID = @empid,
                IsActive = @isActive
            WHERE UserId = @uid
        `);

        // 3️⃣ تحديث كلمة المرور (لو اتبعتت)
        if (Password && Password.trim() !== '') {
            const passRequest = new sql.Request();
            passRequest.input('uid', sql.Int, id);
            passRequest.input('pass', sql.VarChar, Password);
            await passRequest.query(`UPDATE tbl_users SET Password = @pass WHERE UserId = @uid`);
        }

        // 4️⃣ تحديث الصلاحيات (حذف القديم وإعادة الإدراج)
        if (Array.isArray(permissions)) {
            await savePermissions(id, permissions);
        }

        res.status(200).json({ success: true, message: 'تم تحديث المستخدم بنجاح' });
    } catch (err) {
        console.error('updateUser error:', err);
        res.status(500).json({ success: false, message: 'خطأ في تحديث المستخدم', error: err.message });
    }
};

// 🔄 تفعيل / تعطيل مستخدم
const toggleUserActive = async (req, res) => {
    const { id } = req.params;
    const { IsActive } = req.body;

    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, id);
        request.input('isActive', sql.Bit, IsActive ? 1 : 0);

        const result = await request.query(`
            UPDATE tbl_users SET IsActive = @isActive WHERE UserId = @uid
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

        res.status(200).json({
            success: true,
            message: IsActive ? 'تم تفعيل المستخدم' : 'تم تعطيل المستخدم'
        });
    } catch (err) {
        console.error('toggleUserActive error:', err);
        res.status(500).json({ success: false, message: 'خطأ في تحديث حالة المستخدم', error: err.message });
    }
};

// 🗑️ حذف مستخدم نهائيًا + صلاحياته
const deleteUser = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, id);

        // حذف الصلاحيات أولاً ثم المستخدم
        await request.query(`DELETE FROM tbl_usercontrol WHERE userCode = @uid`);
        const result = await request.query(`DELETE FROM tbl_users WHERE UserId = @uid`);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

        res.status(200).json({ success: true, message: 'تم حذف المستخدم بنجاح' });
    } catch (err) {
        console.error('deleteUser error:', err);
        res.status(500).json({ success: false, message: 'خطأ في حذف المستخدم', error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────
// 🛠️ دالة مساعدة: حفظ صلاحيات مستخدم (حذف القديم + إدراج الجديد)
// ─────────────────────────────────────────────────────────────
async function savePermissions(userId, permissions) {
    const delRequest = new sql.Request();
    delRequest.input('uid', sql.Int, userId);
    await delRequest.query(`DELETE FROM tbl_usercontrol WHERE userCode = @uid`);

    if (!Array.isArray(permissions) || permissions.length === 0) return;

    for (const p of permissions) {
        if (!p.fname) continue;
        const insRequest = new sql.Request();
        insRequest.input('uid', sql.Int, userId);
        insRequest.input('fname', sql.VarChar, p.fname);
        insRequest.input('canAdd', sql.Bit, p.canAdd ? 1 : 0);
        insRequest.input('canEdit', sql.Bit, p.canEdit ? 1 : 0);
        insRequest.input('canDelete', sql.Bit, p.canDelete ? 1 : 0);
        insRequest.input('canOpen', sql.Bit, p.canOpen ? 1 : 0);
        insRequest.input('canview', sql.Bit, p.canview ? 1 : 0);

        await insRequest.query(`
            INSERT INTO tbl_usercontrol (userCode, fname, canAdd, canEdit, canDelete, canOpen, canview)
            VALUES (@uid, @fname, @canAdd, @canEdit, @canDelete, @canOpen, @canview)
        `);
    }
}

// 🔑 إعادة تعيين كلمة مرور مستخدم (للمدير)
const resetPassword = async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.trim() === '') {
        return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة مطلوبة' });
    }

    try {
        const request = new sql.Request();
        request.input('uid', sql.Int, id);
        request.input('pass', sql.VarChar, newPassword);

        const result = await request.query(`
            UPDATE tbl_users SET Password = @pass WHERE UserId = @uid
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
        }

        res.status(200).json({ success: true, message: 'تم إعادة تعيين كلمة المرور بنجاح' });
    } catch (err) {
        console.error('resetPassword error:', err);
        res.status(500).json({ success: false, message: 'خطأ في إعادة تعيين كلمة المرور', error: err.message });
    }
};

module.exports = {
    loginUser,
    getUserPermissions,
    changePassword,
    resetPassword,
    updateFcmToken,
    sendNotificationToUser,
    sendNotificationToAll,
    getLeadsAssignees,
    getAllUsers,
    getFormsAndRoles,
    getUserById,
    createUser,
    updateUser,
    toggleUserActive,
    deleteUser
};