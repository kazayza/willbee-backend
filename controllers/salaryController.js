const { sql } = require('../config/db');

// =========================================================================
// 1. الجلب الذكي - fetchPayroll
//    - لو معتمد (salaryDone=1) → أرشيف للعرض فقط
//    - لو مسودة (salaryDone=0) → يعيد الحساب من eshraf ويحدّث
//    - لو مفيش حاجة → يحسب ويحفظ مسودة جديدة
// =========================================================================
const fetchPayroll = async (req, res) => {
    const { month, year, branchId, workerTypeId, empId, user } = req.body;
    const currentUser = user || 'System';

    if (!month || !year) {
        return res.status(400).json({ message: 'الشهر والسنة مطلوبين' });
    }

    try {
        // ======== أولاً: هل فيه مرتبات معتمدة؟ ========
        const checkReq = new sql.Request();
        checkReq.input('month', sql.Int, parseInt(month));
        checkReq.input('year', sql.Int, parseInt(year));

        const approvedCheck = await checkReq.query(`
            SELECT ID FROM tbl_expenses 
            WHERE Kind = N'مرتبات' 
              AND MONTH(expenseDate) = @month 
              AND YEAR(expenseDate) = @year
              AND salaryDone = 1
        `);

        // ✅ لو معتمد → جلب من الأرشيف
        if (approvedCheck.recordset.length > 0) {
            const expenseId = approvedCheck.recordset[0].ID;

            const archReq = new sql.Request();
            archReq.input('expenseId', sql.Int, expenseId);

            let archQuery = `
                SELECT 
                    e.ID as EmpID,
                    e.empName,
                    e.mobile1,
                    e.job,
                    e.BranchID,
                    e.EmpType as workerTypeId,
                    b.branchName,
                    d.salary as BaseSalary,
                    d.extraTime,
                    d.badal,
                    d.Reward,
                    d.penalty,
                    d.busSub,
                    d.qstSolfa,
                    d.Solfa,
                    d.[absence's _Day] as AbsenceDays,
                    d.absence as absenceAmount,
                    d.expenseAmount as netForDB,
                    d.Notes
                FROM tbl_ExpensesDetalis d
                INNER JOIN tbl_empolyee e ON d.empolyee_ID = e.ID
                LEFT JOIN tbl_Branch b ON e.BranchID = b.IDbranch
                WHERE d.IDExpense = @expenseId
            `;

            if (branchId) {
                archReq.input('branchId', sql.Int, parseInt(branchId));
                archQuery += ' AND e.BranchID = @branchId';
            }
            if (workerTypeId) {
                archReq.input('workerTypeId', sql.Int, parseInt(workerTypeId));
                archQuery += ' AND e.EmpType = @workerTypeId';
            }
            if (empId) {
    archReq.input('empId', sql.Int, parseInt(empId));
    archQuery += ' AND e.ID = @empId';
}

            archQuery += ' ORDER BY e.empName ASC';
            const archResult = await archReq.query(archQuery);

            // حساب صافي الموظف من البيانات المحفوظة
            const archiveData = archResult.recordset.map(emp => {
                const totalAdd = (emp.BaseSalary || 0) + (emp.extraTime || 0) + (emp.badal || 0) + (emp.Reward || 0);
                const totalSub = (emp.penalty || 0) + (emp.busSub || 0) + (emp.absenceAmount || 0) + (emp.qstSolfa || 0);
                return {
                    ...emp,
                    netForEmployee: parseFloat((totalAdd - totalSub).toFixed(2))
                };
            });

            return res.status(200).json({
                status: 'approved',
                expenseId: expenseId,
                data: archiveData
            });
        }

        // ======== ثانياً: حساب من tbl_eshraf ========
        const calcReq = new sql.Request();
        calcReq.input('month', sql.Int, parseInt(month));
        calcReq.input('year', sql.Int, parseInt(year));

        let calcQuery = `
            SELECT 
                e.ID as EmpID,
                e.empName,
                e.mobile1,
                e.job,
                e.BranchID,
                e.EmpType as workerTypeId,
                b.branchName,
                w.workdescription,
                
                -- الراتب الأساسي
                ISNULL((SELECT TOP 1 BaseSalary 
                        FROM tbl_baseSalaryEmpolyee 
                        WHERE ID_emp = e.ID 
                        ORDER BY increseDate DESC), 0) as BaseSalary,

                -- استحقاقات (مفصولة في أعمدتها الصحيحة)
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month 
                        AND YEAR(datePenalty) = @year AND KindPenalty = N'اضافى' AND done = 0), 0) as extraTime,

                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month 
                        AND YEAR(datePenalty) = @year AND KindPenalty = N'بدل' AND done = 0), 0) as badal,

                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month 
                        AND YEAR(datePenalty) = @year AND KindPenalty = N'مكافاه' AND done = 0), 0) as Reward,

                -- استقطاعات (مفصولة)
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month 
                        AND YEAR(datePenalty) = @year AND KindPenalty IN (N'اشراف', N'تاخير') AND done = 0), 0) as penalty,

                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month 
                        AND YEAR(datePenalty) = @year AND KindPenalty IN (N'باص', N'اشتراك باص') AND done = 0), 0) as busSub,

                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month 
                        AND YEAR(datePenalty) = @year AND KindPenalty = N'قسط سلفه' AND done = 0), 0) as qstSolfa,

                -- السلفة (بند منفصل - اتصرفت خلال الشهر)
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month 
                        AND YEAR(datePenalty) = @year AND KindPenalty = N'سلفه' AND done = 0), 0) as Solfa,

                -- عدد أيام الغياب
                ISNULL((SELECT COUNT(d.Emp_code) 
                        FROM tbl_absenseEmpDetalies d
                        INNER JOIN tbl_absenseEmp m ON d.ID = m.ID
                        WHERE d.Emp_code = e.ID AND d.Absence = 1 
                        AND MONTH(m.Databsense) = @month 
                        AND YEAR(m.Databsense) = @year), 0) as AbsenceDays

            FROM tbl_empolyee e
            LEFT JOIN tbl_Branch b ON e.BranchID = b.IDbranch
            LEFT JOIN tbl_empworker w ON e.EmpType = w.ID
            WHERE e.empstatus = 1
        `;

        if (branchId) {
            calcReq.input('branchId', sql.Int, parseInt(branchId));
            calcQuery += ' AND e.BranchID = @branchId';
        }
        if (workerTypeId) {
            calcReq.input('workerTypeId', sql.Int, parseInt(workerTypeId));
            calcQuery += ' AND e.EmpType = @workerTypeId';
        }
        if (empId) {
    calcReq.input('empId', sql.Int, parseInt(empId));
    calcQuery += ' AND e.ID = @empId';
}

        calcQuery += ' ORDER BY e.empName ASC';
        const calcResult = await calcReq.query(calcQuery);

        // ======== حساب الغياب والصافي ========
        const payroll = calcResult.recordset.map(emp => {
            // معادلة الغياب: Int(((salary / 22) * days) / 10) * 10
            const dayValue = emp.BaseSalary / 22;
            const absenceAmount = Math.floor((dayValue * emp.AbsenceDays) / 10) * 10;

            const totalAdd = emp.BaseSalary + emp.extraTime + emp.badal + emp.Reward;
            const totalSub = emp.penalty + emp.busSub + absenceAmount + emp.qstSolfa;

            // صافي الموظف (اللي هيستلمه - للواتساب)
            const netForEmployee = parseFloat((totalAdd - totalSub).toFixed(2));
            // صافي التسجيل (محاسبياً - يشمل السلفة)
            const netForDB = parseFloat((netForEmployee + emp.Solfa).toFixed(2));

            return {
                ...emp,
                absenceAmount,
                netForEmployee,
                netForDB
            };
        });

        // ======== حفظ تلقائي كمسودة ========
        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            // هل فيه مسودة قديمة (salaryDone = 0)؟
            const draftCheck = new sql.Request(transaction);
            draftCheck.input('month', sql.Int, parseInt(month));
            draftCheck.input('year', sql.Int, parseInt(year));

            const draftResult = await draftCheck.query(`
                SELECT ID FROM tbl_expenses 
                WHERE Kind = N'مرتبات' 
                  AND MONTH(expenseDate) = @month 
                  AND YEAR(expenseDate) = @year
                  AND salaryDone = 0
            `);

            let expenseID;
            const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
            const headerByan = `رواتب موظفين شهر ${month}/${year}`;

            if (draftResult.recordset.length > 0) {
                // ✏️ تحديث المسودة الموجودة
                expenseID = draftResult.recordset[0].ID;

                const delReq = new sql.Request(transaction);
                delReq.input('expID', sql.Int, expenseID);
                await delReq.query('DELETE FROM tbl_ExpensesDetalis WHERE IDExpense = @expID');

                const updReq = new sql.Request(transaction);
updReq.input('expID', sql.Int, expenseID);
updReq.input('date', sql.DateTime, lastDayOfMonth);
updReq.input('byan', sql.NVarChar, headerByan);
updReq.input('currentUser', sql.NVarChar, currentUser);
await updReq.query(`
    UPDATE tbl_expenses 
    SET expenseDate = @date, expenseByan = @byan, 
        useredit = @currentUser, editTime = GETDATE()
    WHERE ID = @expID
`);
            } else {
                // ➕ إنشاء مسودة جديدة
                const insReq = new sql.Request(transaction);
insReq.input('date', sql.DateTime, lastDayOfMonth);
insReq.input('byan', sql.NVarChar, headerByan);
insReq.input('currentUser', sql.NVarChar, currentUser);

const headResult = await insReq.query(`
    INSERT INTO tbl_expenses 
    (expenseDate, Kind, userAdd, Addtime, salaryDone, expenseByan)
    OUTPUT inserted.ID
    VALUES (@date, N'مرتبات', @currentUser, GETDATE(), 0, @byan)
`);
                expenseID = headResult.recordset[0].ID;
            }

            // 📝 إدراج تفاصيل كل موظف
            for (const emp of payroll) {
                const detReq = new sql.Request(transaction);
                detReq.input('expID', sql.Int, expenseID);
                detReq.input('empID', sql.Int, emp.EmpID);
                detReq.input('expenseAmount', sql.Decimal(9, 2), emp.netForDB);
                detReq.input('salary', sql.Decimal(7, 2), emp.BaseSalary);
                detReq.input('extraTime', sql.Decimal(7, 2), emp.extraTime);
                detReq.input('badal', sql.Decimal(7, 2), emp.badal);
                detReq.input('reward', sql.Decimal(7, 2), emp.Reward);
                detReq.input('penalty', sql.Decimal(7, 2), emp.penalty);
                detReq.input('busSub', sql.Decimal(7, 2), emp.busSub);
                detReq.input('qstSolfa', sql.Decimal(7, 2), emp.qstSolfa);
                detReq.input('solfa', sql.Decimal(7, 2), emp.Solfa);
                detReq.input('absDays', sql.SmallInt, emp.AbsenceDays);
                detReq.input('absAmount', sql.Decimal(7, 2), emp.absenceAmount);
                detReq.input('branch', sql.SmallInt, emp.BranchID || 1);
                detReq.input('empworkID', sql.Int, emp.workerTypeId || null);
                detReq.input('byan', sql.NVarChar, `راتب ${emp.empName} شهر ${month}`);

                await detReq.query(`
                    INSERT INTO tbl_ExpensesDetalis 
                    (IDExpense, empolyee_ID, expenseAmount, salary, extraTime, badal, Reward, 
                     penalty, busSub, qstSolfa, Solfa, [absence's _Day], absence, 
                     expenseBranchtxt, empworkID, expenseKind, Byan)
                    VALUES 
                    (@expID, @empID, @expenseAmount, @salary, @extraTime, @badal, @reward, 
                     @penalty, @busSub, @qstSolfa, @solfa, @absDays, @absAmount, 
                     @branch, @empworkID, 8, @byan)
                `);
            }

            await transaction.commit();

            return res.status(200).json({
                status: 'draft',
                expenseId: expenseID,
                data: payroll
            });

        } catch (innerErr) {
            await transaction.rollback();
            throw innerErr;
        }

    } catch (err) {
        console.error("Fetch Payroll Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// =========================================================================
// 2. تحديث المسودة بعد التعديل اليدوي - updateDraft
// =========================================================================
const updateDraft = async (req, res) => {
    const { expenseId, user, payrollList } = req.body;

    if (!expenseId || !payrollList || payrollList.length === 0) {
        return res.status(400).json({ message: 'بيانات ناقصة' });
    }

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // التأكد إن المسودة لسه مش معتمدة
        const checkReq = new sql.Request(transaction);
        checkReq.input('expID', sql.Int, expenseId);
        const checkResult = await checkReq.query(
            'SELECT salaryDone FROM tbl_expenses WHERE ID = @expID'
        );

        if (checkResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ message: 'السجل غير موجود' });
        }
        if (checkResult.recordset[0].salaryDone === true || checkResult.recordset[0].salaryDone === 1) {
            await transaction.rollback();
            return res.status(400).json({ message: 'لا يمكن تعديل مرتبات معتمدة' });
        }

        // حذف التفاصيل القديمة
        const delReq = new sql.Request(transaction);
        delReq.input('expID', sql.Int, expenseId);
        await delReq.query('DELETE FROM tbl_ExpensesDetalis WHERE IDExpense = @expID');

        // تحديث الهيدر
        const updReq = new sql.Request(transaction);
        updReq.input('expID', sql.Int, expenseId);
        updReq.input('user', sql.NVarChar, user || 'ManualSave');
        await updReq.query(`
            UPDATE tbl_expenses 
            SET useredit = @user, editTime = GETDATE()
            WHERE ID = @expID
        `);

        // إدراج التفاصيل المعدلة
        for (const emp of payrollList) {
            const detReq = new sql.Request(transaction);
            detReq.input('expID', sql.Int, expenseId);
            detReq.input('empID', sql.Int, emp.EmpID);
            detReq.input('expenseAmount', sql.Decimal(9, 2), emp.netForDB);
            detReq.input('salary', sql.Decimal(7, 2), emp.BaseSalary);
            detReq.input('extraTime', sql.Decimal(7, 2), emp.extraTime);
            detReq.input('badal', sql.Decimal(7, 2), emp.badal);
            detReq.input('reward', sql.Decimal(7, 2), emp.Reward);
            detReq.input('penalty', sql.Decimal(7, 2), emp.penalty);
            detReq.input('busSub', sql.Decimal(7, 2), emp.busSub);
            detReq.input('qstSolfa', sql.Decimal(7, 2), emp.qstSolfa);
            detReq.input('solfa', sql.Decimal(7, 2), emp.Solfa);
            detReq.input('absDays', sql.SmallInt, emp.AbsenceDays);
            detReq.input('absAmount', sql.Decimal(7, 2), emp.absenceAmount);
            detReq.input('branch', sql.SmallInt, emp.BranchID || 1);
            detReq.input('empworkID', sql.Int, emp.workerTypeId || null);
            detReq.input('notes', sql.NVarChar, emp.Notes || '');
            detReq.input('byan', sql.NVarChar, emp.Byan || '');

            await detReq.query(`
                INSERT INTO tbl_ExpensesDetalis 
                (IDExpense, empolyee_ID, expenseAmount, salary, extraTime, badal, Reward, 
                 penalty, busSub, qstSolfa, Solfa, [absence's _Day], absence, 
                 expenseBranchtxt, empworkID, expenseKind, Byan, Notes)
                VALUES 
                (@expID, @empID, @expenseAmount, @salary, @extraTime, @badal, @reward, 
                 @penalty, @busSub, @qstSolfa, @solfa, @absDays, @absAmount, 
                 @branch, @empworkID, 8, @byan, @notes)
            `);
        }

        await transaction.commit();
        res.status(200).json({ message: 'تم حفظ التعديلات بنجاح 💾' });

    } catch (err) {
        await transaction.rollback();
        console.error("Update Draft Error:", err);
        res.status(500).json({ message: 'فشل حفظ التعديلات', error: err.message });
    }
};

// =========================================================================
// 3. اعتماد الرواتب - approvePayroll
//    - salaryDone = 1
//    - done = 1 في tbl_eshraf
// =========================================================================
const approvePayroll = async (req, res) => {
    const { expenseId, month, year, user } = req.body;

    if (!expenseId || !month || !year) {
        return res.status(400).json({ message: 'بيانات ناقصة' });
    }

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // التأكد إن المسودة موجودة ومش معتمدة
        const checkReq = new sql.Request(transaction);
        checkReq.input('expID', sql.Int, expenseId);
        const checkResult = await checkReq.query(
            'SELECT salaryDone FROM tbl_expenses WHERE ID = @expID'
        );

        if (checkResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ message: 'السجل غير موجود' });
        }
        if (checkResult.recordset[0].salaryDone === true || checkResult.recordset[0].salaryDone === 1) {
            await transaction.rollback();
            return res.status(400).json({ message: 'المرتبات معتمدة بالفعل' });
        }

        // 1️⃣ تحديث salaryDone = 1
        const updReq = new sql.Request(transaction);
        updReq.input('expID', sql.Int, expenseId);
        updReq.input('user', sql.NVarChar, user || 'Admin');
        await updReq.query(`
            UPDATE tbl_expenses 
            SET salaryDone = 1, useredit = @user, editTime = GETDATE()
            WHERE ID = @expID
        `);

        // 2️⃣ جلب قائمة الموظفين في هذا المرتب
        const empReq = new sql.Request(transaction);
        empReq.input('expID', sql.Int, expenseId);
        const empList = await empReq.query(
            'SELECT empolyee_ID FROM tbl_ExpensesDetalis WHERE IDExpense = @expID'
        );

        // 3️⃣ تقفيل done = 1 في tbl_eshraf لكل موظف
        for (const emp of empList.recordset) {
            const eshReq = new sql.Request(transaction);
            eshReq.input('empID', sql.Int, emp.empolyee_ID);
            eshReq.input('month', sql.Int, parseInt(month));
            eshReq.input('year', sql.Int, parseInt(year));

            await eshReq.query(`
                UPDATE tbl_eshraf 
                SET done = 1 
                WHERE empolyeeID = @empID 
                  AND MONTH(datePenalty) = @month 
                  AND YEAR(datePenalty) = @year 
                  AND done = 0
            `);
        }

        await transaction.commit();
        res.status(200).json({ message: 'تم اعتماد الرواتب بنجاح ✅' });

    } catch (err) {
        await transaction.rollback();
        console.error("Approve Payroll Error:", err);
        res.status(500).json({ message: 'فشل الاعتماد', error: err.message });
    }
};
// ✅ استعلام رواتب بفترة من-إلى
const fetchPayrollRange = async (req, res) => {
    const { fromMonth, fromYear, toMonth, toYear, branchId, empId } = req.query;

    if (!fromMonth || !fromYear || !toMonth || !toYear) {
        return res.status(400).json({ message: 'الفترة مطلوبة (fromMonth, fromYear, toMonth, toYear)' });
    }

    try {
        const request = new sql.Request();
        request.input('fromMonth', sql.Int, parseInt(fromMonth));
        request.input('fromYear', sql.Int, parseInt(fromYear));
        request.input('toMonth', sql.Int, parseInt(toMonth));
        request.input('toYear', sql.Int, parseInt(toYear));

        let query = `
            SELECT 
                d.empolyee_ID AS EmpID,
                e.empName,
                e.job,
                e.BranchID,
                b.branchName,
                MONTH(ex.expenseDate) AS salaryMonth,
                YEAR(ex.expenseDate) AS salaryYear,
                d.salary AS BaseSalary,
                d.extraTime,
                d.badal,
                d.Reward,
                d.penalty,
                d.busSub,
                d.qstSolfa,
                d.Solfa,
                d.[absence's _Day] AS AbsenceDays,
                d.absence AS absenceAmount,
                d.expenseAmount AS netForDB,
                d.Notes,
                ex.salaryDone,
                ex.expenseDate
            FROM tbl_ExpensesDetalis d
            INNER JOIN tbl_expenses ex ON d.IDExpense = ex.ID
            INNER JOIN tbl_empolyee e ON d.empolyee_ID = e.ID
            LEFT JOIN tbl_Branch b ON e.BranchID = b.IDbranch
            WHERE ex.Kind = N'مرتبات'
              AND (
                  (YEAR(ex.expenseDate) * 100 + MONTH(ex.expenseDate)) 
                  BETWEEN 
                  (@fromYear * 100 + @fromMonth) 
                  AND 
                  (@toYear * 100 + @toMonth)
              )
        `;

        if (branchId) {
            request.input('branchId', sql.Int, parseInt(branchId));
            query += ' AND e.BranchID = @branchId';
        }

        if (empId) {
            request.input('empId', sql.Int, parseInt(empId));
            query += ' AND d.empolyee_ID = @empId';
        }

        query += ' ORDER BY ex.expenseDate DESC, e.empName ASC';

        const result = await request.query(query);

        // حساب صافي الموظف
        const data = result.recordset.map(emp => {
            const totalAdd = (emp.BaseSalary || 0) + (emp.extraTime || 0) + (emp.badal || 0) + (emp.Reward || 0);
            const totalSub = (emp.penalty || 0) + (emp.busSub || 0) + (emp.absenceAmount || 0) + (emp.qstSolfa || 0);
            const netForEmployee = parseFloat((totalAdd - totalSub).toFixed(2));

            return {
                ...emp,
                netForEmployee
            };
        });

        res.status(200).json({
            success: true,
            count: data.length,
            data: data
        });

    } catch (err) {
        console.error('fetchPayrollRange error:', err);
        res.status(500).json({ message: 'خطأ في جلب بيانات الرواتب', error: err.message });
    }
};
// ✅ استعلام رواتب من الداتابيز فقط (بدون حساب)
const queryPayroll = async (req, res) => {
    
    const { fromMonth, fromYear, toMonth, toYear, branchId, empId } = req.query;

    if (!fromMonth || !fromYear || !toMonth || !toYear) {
        return res.status(400).json({ 
            message: 'الفترة مطلوبة' 
        });
    }

    try {
        const request = new sql.Request();
        request.input('fromMonth', sql.Int, parseInt(fromMonth));
        request.input('fromYear', sql.Int, parseInt(fromYear));
        request.input('toMonth', sql.Int, parseInt(toMonth));
        request.input('toYear', sql.Int, parseInt(toYear));

        let query = `
            SELECT 
                d.empolyee_ID AS EmpID,
                e.empName,
                e.job,
                e.BranchID,
                b.branchName,
                MONTH(ex.expenseDate) AS salaryMonth,
                YEAR(ex.expenseDate) AS salaryYear,
                d.salary AS BaseSalary,
                d.extraTime,
                d.badal,
                d.Reward,
                d.penalty,
                d.busSub,
                d.qstSolfa,
                d.Solfa,
                d.[absence's _Day] AS AbsenceDays,
                d.absence AS absenceAmount,
                d.expenseAmount AS netForDB,
                d.Notes,
                ex.salaryDone,
                ex.expenseDate,
                ex.userAdd,
                ex.useredit
            FROM tbl_ExpensesDetalis d
            INNER JOIN tbl_expenses ex ON d.IDExpense = ex.ID
            INNER JOIN tbl_empolyee e ON d.empolyee_ID = e.ID
            LEFT JOIN tbl_Branch b ON e.BranchID = b.IDbranch
            WHERE ex.Kind = N'مرتبات'
              AND (
                  (YEAR(ex.expenseDate) * 100 + MONTH(ex.expenseDate)) 
                  BETWEEN 
                  (@fromYear * 100 + @fromMonth) 
                  AND 
                  (@toYear * 100 + @toMonth)
              )
        `;

        if (branchId) {
            request.input('branchId', sql.Int, parseInt(branchId));
            query += ' AND e.BranchID = @branchId';
        }

        if (empId) {
            request.input('empId', sql.Int, parseInt(empId));
            query += ' AND d.empolyee_ID = @empId';
        }

        query += ' ORDER BY ex.expenseDate DESC, e.empName ASC';

        const result = await request.query(query);

        const data = result.recordset.map(emp => {
            const totalAdd = (emp.BaseSalary || 0) + (emp.extraTime || 0) 
                           + (emp.badal || 0) + (emp.Reward || 0);
            const totalSub = (emp.penalty || 0) + (emp.busSub || 0) 
                           + (emp.absenceAmount || 0) + (emp.qstSolfa || 0);
            const netForEmployee = parseFloat((totalAdd - totalSub).toFixed(2));

            return { ...emp, netForEmployee };
        });

        res.status(200).json({
            success: true,
            count: data.length,
            data: data
        });

    } catch (err) {
        console.error('queryPayroll error:', err);
        res.status(500).json({ 
            message: 'خطأ في الاستعلام', 
            error: err.message 
        });
    }
};

module.exports = { 
    fetchPayroll, 
    updateDraft, 
    approvePayroll, 
    fetchPayrollRange,
    queryPayroll,
};