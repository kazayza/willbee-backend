const { sql } = require('../config/db');

// 1. معاينة كشف الرواتب (حسابات فقط - بدون حفظ)
const previewPayroll = async (req, res) => {
    const { month, year } = req.query;

    try {
        const query = `
            SELECT 
                e.ID as EmpID,
                e.empName,
                e.job,
                
                -- 1. الراتب الأساسي
                ISNULL((SELECT TOP 1 BaseSalary FROM tbl_baseSalaryEmpolyee WHERE ID_emp = e.ID ORDER BY increseDate DESC), 0) as BaseSalary,

                -- 2. إجمالي المكافآت (الإضافي)
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year 
                        AND KindPenalty IN ('مكافأة', 'حافز', 'إضافي', 'بدل')), 0) as Rewards,

                -- 3. إجمالي الخصومات (غياب/تأخير)
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year 
                        AND KindPenalty IN ('غياب', 'تأخير', 'جزاء')), 0) as Deductions,

                -- 4. السلف (القسط المستحق) - هنا بنفترض إن السلفة بتتسجل كنوع 'سلفة' في الإشراف
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year 
                        AND KindPenalty = 'سلفة'), 0) as Loans

            FROM tbl_empolyee e
            WHERE e.empstatus = 1 -- الموظفين النشطين فقط
        `;

        const request = new sql.Request();
        request.input('month', sql.Int, month);
        request.input('year', sql.Int, year);

        const result = await request.query(query);

        // حساب الصافي في الكود (ممكن يتعمل في الـ SQL بس هنا أسهل للتعديل)
        const payroll = result.recordset.map(emp => {
            const netSalary = emp.BaseSalary + emp.Rewards - emp.Deductions - emp.Loans;
            return {
                ...emp,
                NetSalary: netSalary
            };
        });

        res.status(200).json(payroll);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. اعتماد وصرف الرواتب (Bulk Insert)
const confirmPayroll = async (req, res) => {
    const { month, year, user, branchId, payrollList } = req.body;
    // payrollList: هي القائمة اللي رجعت من المعاينة (بعد ما المدير راجعها)

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 1️⃣ تسجيل "رأس" المصروف الجماعي (مثلاً: رواتب شهر يناير)
        const requestHead = new sql.Request(transaction);
        requestHead.input('date', sql.DateTime, new Date());
        requestHead.input('user', sql.VarChar, user);
        requestHead.input('byan', sql.VarChar, `رواتب موظفين شهر ${month}/${year}`);

        const headResult = await requestHead.query(`
            INSERT INTO tbl_expenses (expenseDate, Kind, userAdd, Addtime, salaryDone, expenseByan)
            OUTPUT inserted.ID
            VALUES (@date, 'مرتبات', @user, GETDATE(), 1, @byan)
        `);
        const expenseID = headResult.recordset[0].ID;

        // 2️⃣ تسجيل تفاصيل كل موظف
        for (const emp of payrollList) {
            const requestDetail = new sql.Request(transaction);
            requestDetail.input('expID', sql.Int, expenseID);
            requestDetail.input('empID', sql.Int, emp.EmpID);
            requestDetail.input('net', sql.Decimal(9, 2), emp.NetSalary);
            requestDetail.input('base', sql.Decimal(9, 2), emp.BaseSalary);
            requestDetail.input('reward', sql.Decimal(9, 2), emp.Rewards);
            requestDetail.input('deduct', sql.Decimal(9, 2), emp.Deductions);
            requestDetail.input('solfa', sql.Decimal(9, 2), emp.Loans);
            requestDetail.input('branch', sql.SmallInt, branchId);
            requestDetail.input('byan', sql.VarChar, `راتب ${emp.empName}`);

            // بنسجل كل التفاصيل في جدول تفاصيل المصروفات
            // لاحظ: بنستخدم الأعمدة المتاحة (Reward, absence, Solfa)
            await requestDetail.query(`
                INSERT INTO tbl_ExpensesDetalis 
                (IDExpense, empolyee_ID, expenseAmount, salary, Reward, absence, Solfa, expenseBranchtxt, expenseKind, Byan)
                VALUES 
                (@expID, @empID, @net, @base, @reward, @deduct, @solfa, @branch, 15, @byan)
            `);
        }

        // 3️⃣ تحديث جدول الإشراف (قفل الجزاءات والسلف)
        const updateRequest = new sql.Request(transaction);
        updateRequest.input('m', sql.Int, month);
        updateRequest.input('y', sql.Int, year);
        
        await updateRequest.query(`
            UPDATE tbl_eshraf 
            SET done = 1 
            WHERE MONTH(datePenalty) = @m AND YEAR(datePenalty) = @y AND done = 0
        `);

        await transaction.commit();
        res.status(201).json({ message: 'تم اعتماد وصرف الرواتب بنجاح ✅' });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'فشل صرف الرواتب', error: err.message });
    }
};

module.exports = { previewPayroll, confirmPayroll };