const { sql } = require('../config/db');

// =========================================================================
// 1. دالة المعاينة وتجهيز الرواتب (Preview) - تفصيل كامل للبنود
// =========================================================================
const previewPayroll = async (req, res) => {
    const { month, year } = req.query;

    try {
        const query = `
            SELECT 
                e.ID as EmpID,
                e.empName,
                e.mobile1,
                e.job,
                
                -- 1. الراتب الأساسي
                ISNULL((SELECT TOP 1 BaseSalary FROM tbl_baseSalaryEmpolyee WHERE ID_emp = e.ID ORDER BY increseDate DESC), 0) as BaseSalary,

                -- 2. التفصيل للاستحقاقات (مفصولة للعرض في فلاتر)
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year AND KindPenalty = 'اضافى' AND done = 0), 0) as Overtime,
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year AND KindPenalty = 'بدل' AND done = 0), 0) as Allowance,
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year AND KindPenalty IN ('مكافاه', 'حافز', 'اشراف') AND done = 0), 0) as Rewards,

                -- 3. التفصيل للاستقطاعات الإدارية
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year AND KindPenalty IN ('تاخير', 'جزاء') AND done = 0), 0) as Deductions,
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year AND KindPenalty = 'اشتراك باص' AND done = 0), 0) as BusDeduction,

                -- 4. السلف
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year AND KindPenalty = 'قسط سلفه' AND done = 0), 0) as qstSolfa,
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year AND KindPenalty = 'سلفه' AND done = 0), 0) as Solfa,

                -- 5. عدد أيام الغياب من جدول الحضور
                ISNULL((SELECT COUNT(d.Emp_code) 
                        FROM tbl_absenseEmpDetalies d
                        INNER JOIN tbl_absenseEmp m ON d.ID = m.ID
                        WHERE d.Emp_code = e.ID AND d.Absence = 1 
                        AND MONTH(m.Databsense) = @month AND YEAR(m.Databsense) = @year), 0) as AbsenceDays

            FROM tbl_empolyee e
            WHERE e.empstatus = 1 
        `;

        const request = new sql.Request();
        request.input('month', sql.Int, month);
        request.input('year', sql.Int, year);

        const result = await request.query(query);

        // حساب قيمة الغياب والصافي المبدئي برمجياً
        const payroll = result.recordset.map(emp => {
            const dayValue = emp.BaseSalary / 30; // قيمة اليوم
            const absenceDeduction = emp.AbsenceDays * dayValue; // قيمة الغياب بالمال

            // إجمالي الإضافات
            const totalAdditions = emp.BaseSalary + emp.Overtime + emp.Allowance + emp.Rewards;
            // إجمالي الخصومات
            const totalDeductions = emp.Deductions + emp.BusDeduction + absenceDeduction + emp.qstSolfa;
            
            // الصافي الأولي (قبل التعديل اليدوي في فلاتر)
            const netSalary = totalAdditions - totalDeductions;
            
            return {
                ...emp,
                AbsenceDeductionAmount: parseFloat(absenceDeduction.toFixed(2)),
                NetSalary: parseFloat(netSalary.toFixed(2))
            };
        });

        res.status(200).json(payroll);

    } catch (err) {
        console.error("Preview Payroll Error: ", err);
        res.status(500).json({ error: err.message });
    }
};

// =========================================================================
// 2. دالة الاعتماد، الحفظ، وتقفيل الحركات (Confirm)
// =========================================================================
const confirmPayroll = async (req, res) => {
    // payrollList: تأتي من فلاتر مجمعة وجاهزة (Rewards تحتوي كل الإضافات، Deductions تحتوي كل الخصومات)
    const { month, year, user, branchId, payrollList } = req.body;

    if (!payrollList || payrollList.length === 0) {
        return res.status(400).json({ message: 'القائمة فارغة لا يمكن الحفظ' });
    }

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 🌟 حساب تاريخ "آخر يوم في الشهر" لتسجيل الفاتورة محاسبياً بشكل صحيح
        // في الجافاسكريبت: وضع اليوم = 0 يعطينا آخر يوم في الشهر الذي يسبقه
        const lastDayOfMonth = new Date(year, month, 0, 23, 59, 59);
        const headerByan = `رواتب موظفين شهر ${month}/${year}`; 

        // 1️⃣ تسجيل "رأس" الحركة في جدول المصروفات بالتاريخ الجديد
        const requestHead = new sql.Request(transaction);
        requestHead.input('date', sql.DateTime, lastDayOfMonth); 
        requestHead.input('user', sql.VarChar, user);
        requestHead.input('byan', sql.VarChar, headerByan);

        const headResult = await requestHead.query(`
            INSERT INTO tbl_expenses (expenseDate, Kind, userAdd, Addtime, salaryDone, expenseByan)
            OUTPUT inserted.ID
            VALUES (@date, 'مرتبات', @user, GETDATE(), 1, @byan)
        `);
        const expenseID = headResult.recordset[0].ID;

        // 2️⃣ تسجيل شريط قبض كل موظف + تقفيل حركاته
        for (const emp of payrollList) {
            const requestDetail = new sql.Request(transaction);
            requestDetail.input('expID', sql.Int, expenseID);
            requestDetail.input('empID', sql.Int, emp.EmpID);
            requestDetail.input('net', sql.Decimal(9, 2), emp.NetSalary);
            requestDetail.input('base', sql.Decimal(7, 2), emp.BaseSalary); // تأكدنا من توافق الاسم مع فلاتر
            
            // نأخذ المجمّع من فلاتر
            requestDetail.input('reward', sql.Decimal(7, 2), emp.Rewards);
            requestDetail.input('deduct', sql.Decimal(7, 2), emp.Deductions);
            
            requestDetail.input('absDays', sql.SmallInt, emp.AbsenceDays);
            requestDetail.input('absAmount', sql.Decimal(7, 2), emp.AbsenceDeductionAmount);
            requestDetail.input('qstSolfa', sql.Decimal(7, 2), emp.qstSolfa);
            requestDetail.input('solfa', sql.Decimal(7, 0), emp.Solfa);
            requestDetail.input('branch', sql.SmallInt, branchId || 1);
            requestDetail.input('byan', sql.VarChar, `راتب ${emp.empName} شهر ${month}`);

            // إدخال التفاصيل بنوع مصروف 8
            await requestDetail.query(`
                INSERT INTO tbl_ExpensesDetalis 
                (IDExpense, empolyee_ID, expenseAmount, salary, Reward, penalty, absence, [absence's _Day], qstSolfa, Solfa, expenseBranchtxt, expenseKind, Byan)
                VALUES 
                (@expID, @empID, @net, @base, @reward, @deduct, @absAmount, @absDays, @qstSolfa, @solfa, @branch, 8, @byan)
            `);

            // تحديث جدول الإشراف وتصفير الحركات (done = 1) لهذا الموظف فقط
            const updateRequest = new sql.Request(transaction);
            updateRequest.input('empID', sql.Int, emp.EmpID);
            updateRequest.input('m', sql.Int, month);
            updateRequest.input('y', sql.Int, year);
            
            await updateRequest.query(`
                UPDATE tbl_eshraf 
                SET done = 1 
                WHERE empolyeeID = @empID AND MONTH(datePenalty) = @m AND YEAR(datePenalty) = @y AND done = 0
            `);
        }

        // 3️⃣ تأكيد الحفظ في قاعدة البيانات
        await transaction.commit();
        res.status(201).json({ message: 'تم الاعتماد بنجاح ✅' });

    } catch (err) {
        await transaction.rollback();
        console.error("Confirm Payroll Error: ", err);
        res.status(500).json({ message: 'فشل صرف الرواتب', error: err.message });
    }
};

// =========================================================================
// 3. دالة جلب الأرشيف (تعتمد على التاريخ والنوع)
// =========================================================================
const getPayrollHistory = async (req, res) => {
    const { month, year } = req.query;

    try {
        // 🌟 البحث باستخدام الشهر والسنة من حقل التاريخ (expenseDate)
        const query = `
            SELECT 
                e.ID as EmpID,
                e.empName,
                e.mobile1,
                e.job,
                d.salary as BaseSalary,
                d.Reward as Rewards,   -- المجمعة
                d.penalty as Deductions, -- المجمعة
                d.qstSolfa as qstSolfa,
                d.Solfa as Solfa,
                d.[absence's _Day] as AbsenceDays,
                d.absence as AbsenceDeductionAmount,
                d.expenseAmount as NetSalary
            FROM tbl_ExpensesDetalis d
            INNER JOIN tbl_expenses ex ON d.IDExpense = ex.ID
            INNER JOIN tbl_empolyee e ON d.empolyee_ID = e.ID
            WHERE ex.Kind = 'مرتبات' 
              AND MONTH(ex.expenseDate) = @m 
              AND YEAR(ex.expenseDate) = @y
        `;

        const request = new sql.Request();
        request.input('m', sql.Int, month);
        request.input('y', sql.Int, year);

        const result = await request.query(query);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error("History Payroll Error: ", err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { previewPayroll, confirmPayroll, getPayrollHistory };