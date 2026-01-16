const { sql } = require('../config/db');

// دالة تسجيل الدخول
const loginUser = async (req, res) => {
    // بناخد الاسم والباسورد من التطبيق
    const { UserName, Password } = req.body;

    try {
        const request = new sql.Request();
        
        // بنحمي البيانات
        request.input('user', sql.VarChar, UserName);
        request.input('pass', sql.VarChar, Password);

        // بنبحث عن مستخدم عنده نفس الاسم والباسورد
        const result = await request.query(`
            SELECT UserId, FullName, Role, permision 
            FROM tbl_users 
            WHERE UserName = @user AND Password = @pass
        `);

        // لو لقينا نتيجة (يعني البيانات صح)
        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            res.status(200).json({
                message: 'تم تسجيل الدخول بنجاح ✅',
                user: user // بنرجع بيانات المستخدم عشان التطبيق يحفظها
            });
        } else {
            // لو ملقيناش حد بالبيانات دي
            res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة ❌' });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في السيرفر', error: err.message });
    }
};

module.exports = {
    loginUser
};