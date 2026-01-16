const { sql } = require('../config/db');

// دالة تسجيل الدخول (المطورة)
const loginUser = async (req, res) => {
    const { UserName, Password } = req.body;

    try {
        const request = new sql.Request();
        request.input('user', sql.VarChar, UserName);
        request.input('pass', sql.VarChar, Password);

        // 1️⃣ التحقق من بيانات المستخدم
        const userResult = await request.query(`
            SELECT UserId, FullName, Role, permision 
            FROM tbl_users 
            WHERE UserName = @user AND Password = @pass
        `);

        if (userResult.recordset.length > 0) {
            const user = userResult.recordset[0];

            // 2️⃣ جلب الصلاحيات التفصيلية لهذا المستخدم
            // بنجيب اسم الشاشة (fname) والصلاحيات (إضافة، تعديل، حذف، عرض)
            const permissionsResult = await sql.query(`
                SELECT fname, canAdd, canEdit, canDelete, canview, canOpen
                FROM tbl_usercontrol 
                WHERE userCode = ${user.UserId}
            `);

            // بنرجع المستخدم + صلاحياته في رد واحد
            res.status(200).json({
                message: 'تم تسجيل الدخول بنجاح ✅',
                user: user,
                permissions: permissionsResult.recordset // قائمة الصلاحيات
            });

        } else {
            res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة ❌' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في السيرفر', error: err.message });
    }
};

// دالة لجلب صلاحيات مستخدم (لو حبيت تحدثها من غير خروج ودخول)
const getUserPermissions = async (req, res) => {
    const { id } = req.params; // User ID

    try {
        const result = await sql.query(`
            SELECT fname, canAdd, canEdit, canDelete, canview, canOpen
            FROM tbl_usercontrol 
            WHERE userCode = ${id}
        `);
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    loginUser,
    getUserPermissions
};