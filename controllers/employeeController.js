const { sql } = require('../config/db');

// 1. عرض الموظفين (مع كافة التفاصيل: فرع، إدارة، نوع عمالة)
const getEmployees = async (req, res) => {
    const { search, branchId, activeOnly } = req.query; // فلاتر إضافية

    try {
        const request = new sql.Request();
        
        // جملة الاستعلام الأساسية
        let query = `
            SELECT 
                e.ID, 
                e.empName, 
                e.mobile1, 
                e.job, 
                e.jobdate, 
                e.nationalID,
                e.empstatus,           -- حالة الموظف
                b.branchName,          -- اسم الفرع
                m.ManagmentName,       -- اسم الإدارة
                w.workdescription      -- نوع العمالة (مباشرة/غير مباشرة)
            FROM tbl_empolyee e
            LEFT JOIN tbl_Branch b ON e.BranchID = b.IDbranch
            LEFT JOIN tbl_Managment m ON e.empIDmangment = m.managementID
            LEFT JOIN tbl_empworker w ON e.EmpType = w.ID
            WHERE 1=1 
        `;

        // فلتر البحث بالاسم
        if (search) {
            request.input('searchTerm', sql.NVarChar, `%${search}%`);
            query += ' AND e.empName LIKE @searchTerm';
        }

        // فلتر الفرع
        if (branchId) {
            request.input('branch', sql.Int, branchId);
            query += ' AND e.BranchID = @branch';
        }

        // فلتر الحالة (لو عايز النشطين فقط، وهو الافتراضي)
        if (activeOnly !== 'false') { 
            query += ' AND e.empstatus = 1'; 
        }

        query += ' ORDER BY e.empName ASC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching employees', error: err.message });
    }
};

// 2. إضافة موظف جديد (بالبيانات الكاملة)
const createEmployee = async (req, res) => {
    const { 
        empName, mobile1, job, nationalID, 
        branchId, mgmtId, workTypeId, // البيانات الجديدة (IDs)
        baseSalary // الراتب الأساسي (عشان نسجله بالمرة)
    } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // أ) تسجيل بيانات الموظف الأساسية
        const reqEmp = new sql.Request(transaction);
        reqEmp.input('name', sql.NVarChar, empName);
        reqEmp.input('mobile', sql.VarChar, mobile1);
        reqEmp.input('job', sql.VarChar, job);
        reqEmp.input('nid', sql.Decimal(14,0), nationalID);
        reqEmp.input('brID', sql.SmallInt, branchId);
        reqEmp.input('mgID', sql.SmallInt, mgmtId);
        reqEmp.input('wkID', sql.SmallInt, workTypeId);

        const empResult = await reqEmp.query(`
            INSERT INTO tbl_empolyee 
            (empName, mobile1, job, nationalID, BranchID, empIDmangment, EmpType, Addtime, empstatus)
            OUTPUT inserted.ID
            VALUES 
            (@name, @mobile, @job, @nid, @brID, @mgID, @wkID, GETDATE(), 1)
        `);

        const newEmpID = empResult.recordset[0].ID;

        // ب) تسجيل الراتب الأساسي (لو تم إرساله)
        if (baseSalary) {
            const reqSal = new sql.Request(transaction);
            reqSal.input('empID', sql.Int, newEmpID);
            reqSal.input('salary', sql.Decimal(5, 0), baseSalary);

            await reqSal.query(`
                INSERT INTO tbl_baseSalaryEmpolyee (ID_emp, BaseSalary, increseDate)
                VALUES (@empID, @salary, GETDATE())
            `);
        }

        await transaction.commit();
        res.status(201).json({ message: 'تم تعيين الموظف وتسجيل الراتب بنجاح 👔', id: newEmpID });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'فشل الحفظ', error: err.message });
    }
};

// 3. جلب تاريخ رواتب موظف (Salary History)
const getEmployeeSalaryHistory = async (req, res) => {
    const { id } = req.params; // ID الموظف

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);

        const result = await request.query(`
            SELECT BaseSalary, increseDate 
            FROM tbl_baseSalaryEmpolyee 
            WHERE ID_emp = @id 
            ORDER BY increseDate DESC
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching salary history', error: err.message });
    }
};

module.exports = {
    getEmployees,
    createEmployee,
    getEmployeeSalaryHistory
};