const { sql } = require('../config/db');

// دالة تسجيل الدخول (المطورة)
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
                user: user,                      // فيه دلوقتي EmpID كمان
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

module.exports = {
    loginUser,
    getUserPermissions
};