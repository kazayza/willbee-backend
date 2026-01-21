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

module.exports = {
    loginUser,
    getUserPermissions,
    changePassword
};