const { sql } = require('../config/db');

// ✅ 1. تسجيل/تحديث غياب الموظفين (Upsert Logic)
const saveEmpAttendance = async (req, res) => {
    const { date, user, employeeList } = req.body;
    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 🔍 أولاً: نشوف لو فيه سجل لنفس اليوم
        const checkRequest = new sql.Request(transaction);
        checkRequest.input('targetDate', sql.Date, date);
        
        const existingRecord = await checkRequest.query(`
            SELECT ID FROM tbl_absenseEmp 
            WHERE CAST(Databsense AS DATE) = @targetDate
        `);

        let masterID;

        if (existingRecord.recordset.length > 0) {
            // ✏️ تحديث: حذف التفاصيل القديمة واستخدام نفس الـ Master
            masterID = existingRecord.recordset[0].ID;

            const deleteRequest = new sql.Request(transaction);
            deleteRequest.input('masterID', sql.Int, masterID);
            await deleteRequest.query(`
                DELETE FROM tbl_absenseEmpDetalies WHERE ID = @masterID
            `);

            // تحديث بيانات الـ Master
            const updateRequest = new sql.Request(transaction);
            updateRequest.input('masterID', sql.Int, masterID);
            updateRequest.input('user', sql.VarChar, user || 'AppUser');
            await updateRequest.query(`
                UPDATE tbl_absenseEmp 
                SET userEdit = @user, editTime = GETDATE()
                WHERE ID = @masterID
            `);

        } else {
            // ➕ إضافة جديدة
            const insertRequest = new sql.Request(transaction);
            insertRequest.input('date', sql.DateTime, date || new Date());
            insertRequest.input('user', sql.VarChar, user || 'AppUser');

            const headResult = await insertRequest.query(`
                INSERT INTO tbl_absenseEmp (Databsense, userAdd, Addtime)
                OUTPUT inserted.ID
                VALUES (@date, @user, GETDATE())
            `);
            masterID = headResult.recordset[0].ID;
        }

        // 📝 إضافة التفاصيل الجديدة
        for (const emp of employeeList) {
            const detailRequest = new sql.Request(transaction);
            detailRequest.input('masterID', sql.Int, masterID);
            detailRequest.input('empCode', sql.Int, emp.empId);
            detailRequest.input('status', sql.Bit, emp.status ? 1 : 0);
            detailRequest.input('notes', sql.VarChar, emp.notes || '');

            await detailRequest.query(`
                INSERT INTO tbl_absenseEmpDetalies (ID, Emp_code, Absence, Notes)
                VALUES (@masterID, @empCode, @status, @notes)
            `);
        }

        await transaction.commit();
        res.status(201).json({ 
            message: 'تم حفظ غياب الموظفين بنجاح ✅', 
            recordId: masterID,
            isUpdate: existingRecord.recordset.length > 0
        });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'فشل حفظ الغياب', error: err.message });
    }
};

// ✅ 2. جلب غياب الموظفين لتاريخ معين (مع empId)
const getEmpAttendanceByDate = async (req, res) => {
    const { date } = req.query;

    try {
        const request = new sql.Request();
        request.input('targetDate', sql.Date, date);

        const query = `
            SELECT 
                d.Emp_code AS empId,
                e.empName,
                e.job,
                e.BranchID,
                b.branchName,
                d.Absence,
                d.Notes,
                m.ID AS masterId,
                m.Databsense AS date,
                m.userAdd,
                m.Addtime
            FROM tbl_absenseEmp m
            INNER JOIN tbl_absenseEmpDetalies d ON m.ID = d.ID
            INNER JOIN tbl_empolyee e ON d.Emp_code = e.ID
            LEFT JOIN tbl_Aboranch b ON e.BranchID = b.IDbranch
            WHERE CAST(m.Databsense AS DATE) = @targetDate
        `;

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        res.status(500).json({ message: 'Error fetching attendance', error: err.message });
    }
};

// ✅ 3. حذف سجل غياب (اختياري)
const deleteEmpAttendance = async (req, res) => {
    const { masterId, empId } = req.body;

    try {
        const request = new sql.Request();
        
        if (empId) {
            // حذف موظف واحد من الغياب
            request.input('masterId', sql.Int, masterId);
            request.input('empId', sql.Int, empId);
            await request.query(`
                DELETE FROM tbl_absenseEmpDetalies 
                WHERE ID = @masterId AND Emp_code = @empId
            `);
        } else {
            // حذف كل سجل اليوم
            request.input('masterId', sql.Int, masterId);
            await request.query(`
                DELETE FROM tbl_absenseEmpDetalies WHERE ID = @masterId;
                DELETE FROM tbl_absenseEmp WHERE ID = @masterId;
            `);
        }

        res.status(200).json({ message: 'تم الحذف بنجاح' });

    } catch (err) {
        res.status(500).json({ message: 'فشل الحذف', error: err.message });
    }
};
// في employeeAttendanceController.js - أضف الدالة دي

// ✅ 4. جلب كل أيام الغياب المسجلة (للسجل)
const getAttendanceHistory = async (req, res) => {
    const { month, year } = req.query;

    try {
        const request = new sql.Request();
        
        let query = `
            SELECT 
                m.ID AS masterId,
                m.Databsense AS date,
                m.userAdd,
                m.Addtime,
                m.userEdit,
                m.editTime,
                COUNT(d.Emp_code) AS absentCount
            FROM tbl_absenseEmp m
            LEFT JOIN tbl_absenseEmpDetalies d ON m.ID = d.ID
        `;

        // فلترة بالشهر والسنة لو موجودين
        if (month && year) {
            request.input('month', sql.Int, parseInt(month));
            request.input('year', sql.Int, parseInt(year));
            query += ` WHERE MONTH(m.Databsense) = @month AND YEAR(m.Databsense) = @year`;
        } else if (year) {
            request.input('year', sql.Int, parseInt(year));
            query += ` WHERE YEAR(m.Databsense) = @year`;
        }

        query += `
            GROUP BY m.ID, m.Databsense, m.userAdd, m.Addtime, m.userEdit, m.editTime
            ORDER BY m.Databsense DESC
        `;

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        res.status(500).json({ message: 'Error fetching history', error: err.message });
    }
};

module.exports = {
    saveEmpAttendance,
    getEmpAttendanceByDate,
    deleteEmpAttendance,
    getAttendanceHistory 
};
