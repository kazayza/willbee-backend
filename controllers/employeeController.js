const { sql } = require('../config/db');

// 1. عرض الموظفين (مع كافة التفاصيل: فرع، إدارة، نوع عمالة)
const getEmployees = async (req, res) => {
    const { search, branchId, activeOnly, jobTitle, workerTypeId } = req.query;

    try {
        const request = new sql.Request();
        
        let query = `
            SELECT 
                e.ID, 
                e.empName, 
                e.mobile1, 
                e.job, 
                e.jobdate, 
                e.nationalID,
                e.empstatus,
                e.BranchID,        
                e.EmpType as workerTypeId,
                b.branchName,
                m.ManagmentName,
                w.workdescription,
                -- حقول إضافية للعرض
                e.mobile2, e.email, e.adress, e.Qualification, e.Experience
            FROM tbl_empolyee e
            LEFT JOIN tbl_Branch b ON e.BranchID = b.IDbranch
            LEFT JOIN tbl_Managment m ON e.empIDmangment = m.managementID
            LEFT JOIN tbl_empworker w ON e.EmpType = w.ID
            WHERE 1=1 
        `;

       if (search) {
            request.input('searchTerm', sql.NVarChar, `%${search}%`);
            query += ' AND e.empName LIKE @searchTerm';
        }

        if (branchId) {
            request.input('branch', sql.Int, branchId);
            query += ' AND e.BranchID = @branch';
        }

        if (activeOnly !== undefined && activeOnly !== 'null') {
            const status = activeOnly === 'true' ? 1 : 0;
            query += ` AND e.empstatus = ${status}`;
        }

        if (jobTitle) {
            request.input('job', sql.NVarChar, jobTitle);
            query += ' AND e.job = @job';
        }

        if (workerTypeId) {
            request.input('wType', sql.Int, workerTypeId);
            query += ' AND e.EmpType = @wType';
        }

        query += ' ORDER BY e.empName ASC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error fetching employees', error: err.message });
    }
};

// 2. إضافة موظف جديد (شامل كل الحقول والراتب)
const createEmployee = async (req, res) => {
    const { 
        empName, mobile1, mobile2, email, adress, // انتبه adress بـ d واحدة
        job, jobdate, Qualification, Experience,
        nationalID, branchId, mgmtId, workTypeId,
        notes, empstatus, baseSalary,
        userAdd // اسم المستخدم اللي ضاف
    } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // أ) إضافة الموظف
        const reqEmp = new sql.Request(transaction);
        reqEmp.input('name', sql.NVarChar, empName);
        reqEmp.input('mob1', sql.VarChar, mobile1);
        reqEmp.input('mob2', sql.VarChar, mobile2);
        reqEmp.input('mail', sql.VarChar, email);
        reqEmp.input('addr', sql.VarChar, adress);
        
        reqEmp.input('job', sql.VarChar, job);
        reqEmp.input('jDate', sql.DateTime, jobdate);
        reqEmp.input('qual', sql.VarChar, Qualification);
        reqEmp.input('exp', sql.VarChar, Experience);
        
        reqEmp.input('nid', sql.Decimal(14,0), nationalID);
        reqEmp.input('brID', sql.SmallInt, branchId);
        reqEmp.input('mgID', sql.SmallInt, mgmtId);
        reqEmp.input('wkID', sql.SmallInt, workTypeId);
        
        reqEmp.input('note', sql.VarChar, notes);
        reqEmp.input('stat', sql.Bit, empstatus ?? 1); 
        reqEmp.input('user', sql.VarChar, userAdd);

        const resultEmp = await reqEmp.query(`
            INSERT INTO tbl_empolyee 
            (empName, mobile1, mobile2, email, adress, 
             job, jobdate, Qualification, Experience,
             nationalID, BranchID, empIDmangment, EmpType, 
             notes, empstatus, userAdd, Addtime)
            OUTPUT inserted.ID
            VALUES 
            (@name, @mob1, @mob2, @mail, @addr, 
             @job, @jDate, @qual, @exp,
             @nid, @brID, @mgID, @wkID, 
             @note, @stat, @user, GETDATE())
        `);

        const newEmpID = resultEmp.recordset[0].ID;

        // ب) إضافة الراتب الأساسي (لو مبعوت)
        if (baseSalary) {
            const reqSal = new sql.Request(transaction);
            reqSal.input('empID', sql.Int, newEmpID);
            reqSal.input('salary', sql.Decimal(18, 2), baseSalary); 

            await reqSal.query(`
                INSERT INTO tbl_baseSalaryEmpolyee (ID_emp, BaseSalary, increseDate)
                VALUES (@empID, @salary, GETDATE())
            `);
        }

        await transaction.commit();
        res.status(201).json({ message: 'تم إضافة الموظف وراتبه بنجاح 👔' });

    } catch (err) {
        await transaction.rollback();
        console.error("Error creating employee:", err);
        res.status(500).json({ message: 'فشل الحفظ', error: err.message });
    }
};

// 3. تعديل بيانات موظف (بدون راتب)
const updateEmployee = async (req, res) => {
    const { id } = req.params;
    const { 
        empName, mobile1, mobile2, email, adress,
        job, jobdate, Qualification, Experience,
        nationalID, branchId, mgmtId, workTypeId,
        notes, empstatus, userEdit
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        
        request.input('name', sql.NVarChar, empName);
        request.input('mob1', sql.VarChar, mobile1);
        request.input('mob2', sql.VarChar, mobile2);
        request.input('mail', sql.VarChar, email);
        request.input('addr', sql.VarChar, adress);
        
        request.input('job', sql.VarChar, job);
        request.input('jDate', sql.DateTime, jobdate);
        request.input('qual', sql.VarChar, Qualification);
        request.input('exp', sql.VarChar, Experience);
        
        request.input('nid', sql.Decimal(14,0), nationalID);
        request.input('brID', sql.SmallInt, branchId);
        request.input('mgID', sql.SmallInt, mgmtId);
        request.input('wkID', sql.SmallInt, workTypeId);
        
        request.input('note', sql.VarChar, notes);
        request.input('stat', sql.Bit, empstatus);
        request.input('user', sql.VarChar, userEdit);

        await request.query(`
            UPDATE tbl_empolyee 
            SET 
                empName = @name,
                mobile1 = @mob1,
                mobile2 = @mob2,
                email = @mail,
                adress = @addr,
                job = @job,
                jobdate = @jDate,
                Qualification = @qual,
                Experience = @exp,
                nationalID = @nid,
                BranchID = @brID,
                empIDmangment = @mgID,
                EmpType = @wkID,
                notes = @note,
                empstatus = @stat,
                useredit = @user,
                editTime = GETDATE()
            WHERE ID = @id
        `);

        res.status(200).json({ message: 'تم تعديل البيانات بنجاح ✅' });

    } catch (err) {
        console.error("Error updating employee:", err);
        res.status(500).json({ message: 'فشل التعديل', error: err.message });
    }
};

// 4. جلب تاريخ رواتب موظف
const getEmployeeSalaryHistory = async (req, res) => {
    const { id } = req.params; 
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

// 5. جلب الوظائف (للفلتر)
const getEmployeeJobs = async (req, res) => {
    try {
        const result = await sql.query('SELECT DISTINCT job FROM tbl_empolyee WHERE job IS NOT NULL AND job <> \'\'');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. جلب موظف واحد (للتعديل)
const getEmployeeById = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await sql.query(`SELECT * FROM tbl_empolyee WHERE ID = ${id}`);
        if (result.recordset.length > 0) {
            res.status(200).json(result.recordset[0]);
        } else {
            res.status(404).json({ message: 'Not Found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// جلب الموظفين المرتبطين بـ Users فقط
const getEmployeesWithUsers = async (req, res) => {
  try {
    const result = await sql.query(`
      SELECT e.ID, e.empName
      FROM tbl_empolyee e
      INNER JOIN tbl_users u ON u.EmpID = e.ID
      WHERE e.empstatus = 1 -- لو عندك عمود حالة الموظف
    `);
    res.status(200).json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
    getEmployees,
    getEmployeeJobs,
    createEmployee,
    updateEmployee, // 👈 ضفناها
    getEmployeeSalaryHistory,
    getEmployeeById
};