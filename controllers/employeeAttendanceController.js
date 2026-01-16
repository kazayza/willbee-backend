const { sql } = require('../config/db');

// 1. تسجيل غياب الموظفين (Bulk Insert)
const saveEmpAttendance = async (req, res) => {
    // employeeList: مصفوفة فيها {empId, status, notes}
    // status: true (حضور), false (غياب)
    const { date, user, employeeList } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 1️⃣ تسجيل "رأس" يوم الغياب (Master)
        const requestHead = new sql.Request(transaction);
        requestHead.input('date', sql.DateTime, date || new Date());
        requestHead.input('user', sql.VarChar, user || 'AppUser');

        const headResult = await requestHead.query(`
            INSERT INTO tbl_absenseEmp (Databsense, userAdd, Addtime)
            OUTPUT inserted.ID
            VALUES (@date, @user, GETDATE())
        `);

        const masterID = headResult.recordset[0].ID;

        // 2️⃣ تسجيل تفاصيل كل موظف (Loop)
        for (const emp of employeeList) {
            const requestDetail = new sql.Request(transaction);
            
            requestDetail.input('masterID', sql.Int, masterID);
            requestDetail.input('empCode', sql.Int, emp.empId);
            // لاحظ: بنخزن 1 للحضور و 0 للغياب (حسب المنطق المتبع في الأطفال)
            requestDetail.input('status', sql.Bit, emp.status ? 1 : 0); 
            requestDetail.input('notes', sql.VarChar, emp.notes || '');

            // انتبه لاسم الجدول في الداتابيز (Detalies مش Details)
            await requestDetail.query(`
                INSERT INTO tbl_absenseEmpDetalies (ID, Emp_code, Absence, Notes)
                VALUES (@masterID, @empCode, @status, @notes)
            `);
        }

        await transaction.commit();
        res.status(201).json({ message: 'تم حفظ غياب الموظفين بنجاح ✅', recordId: masterID });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'فشل حفظ الغياب', error: err.message });
    }
};

// 2. عرض غياب الموظفين لتاريخ معين
const getEmpAttendanceByDate = async (req, res) => {
    const { date } = req.query;

    try {
        const request = new sql.Request();
        request.input('targetDate', sql.Date, date);

        const query = `
            SELECT 
                e.empName,
                e.job,
                d.Absence, -- 1=Present, 0=Absent
                d.Notes,
                m.Databsense
            FROM tbl_absenseEmp m
            INNER JOIN tbl_absenseEmpDetalies d ON m.ID = d.ID
            INNER JOIN tbl_empolyee e ON d.Emp_code = e.ID
            WHERE CAST(m.Databsense AS DATE) = @targetDate
        `;

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        res.status(500).json({ message: 'Error fetching attendance', error: err.message });
    }
};

module.exports = {
    saveEmpAttendance,
    getEmpAttendanceByDate
};