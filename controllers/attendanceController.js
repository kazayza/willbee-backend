const { sql } = require('../config/db');

// 1. تسجيل غياب يوم كامل (Bulk Insert)
const saveAttendance = async (req, res) => {
    // childrenList: مصفوفة فيها {childId, status, notes} لكل طفل
    const { date, user, childrenList } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 1️⃣ تسجيل "رأس" يوم الغياب (Master)
        const requestHead = new sql.Request(transaction);
        requestHead.input('date', sql.DateTime, date || new Date());
        requestHead.input('user', sql.VarChar, user || 'AppUser');

        const headResult = await requestHead.query(`
            INSERT INTO tbl_absenseChild (Databsense, userAdd, Addtime)
            OUTPUT inserted.ID
            VALUES (@date, @user, GETDATE())
        `);

        const masterID = headResult.recordset[0].ID; // ده رقم سجل الغياب لليوم ده

        // 2️⃣ تسجيل تفاصيل كل طفل (Loop)
        // بنلف على القائمة اللي جاية من التطبيق
        for (const child of childrenList) {
            const requestDetail = new sql.Request(transaction);
            
            requestDetail.input('masterID', sql.Int, masterID);
            requestDetail.input('childCode', sql.Int, child.childId);
            requestDetail.input('status', sql.Bit, child.status ? 1 : 0); // 1=حضور، 0=غياب
            requestDetail.input('notes', sql.VarChar, child.notes || '');

            await requestDetail.query(`
                INSERT INTO tbl_absenceDetalis (ID, Child_code, Absence, Notes)
                VALUES (@masterID, @childCode, @status, @notes)
            `);
        }

        await transaction.commit();
        res.status(201).json({ message: 'تم حفظ الغياب بنجاح ✅', recordId: masterID });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'فشل حفظ الغياب', error: err.message });
    }
};

// 2. عرض غياب يوم محدد (عشان التقارير)
const getAttendanceByDate = async (req, res) => {
    const { date } = req.query; // التاريخ بيجي في الرابط

    try {
        const request = new sql.Request();
        request.input('targetDate', sql.Date, date);

        const query = `
            SELECT 
                c.FullNameArabic,
                d.Absence,
                d.Notes,
                m.Databsense
            FROM tbl_absenseChild m
            INNER JOIN tbl_absenceDetalis d ON m.ID = d.ID
            INNER JOIN tbl_Child c ON d.Child_code = c.ID_Child
            WHERE CAST(m.Databsense AS DATE) = @targetDate
        `;

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في جلب الغياب', error: err.message });
    }
};

module.exports = {
    saveAttendance,
    getAttendanceByDate
};