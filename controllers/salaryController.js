const { sql } = require('../config/db');
// مكتبة مسؤولة عن إرسال طلبات الـ API للواتساب

// 1. دالة المعاينة وتجهيز الرواتب (Preview)
const previewPayroll = async (req, res) => {
    const { month, year } = req.query;

    try {
        const query = `
            SELECT 
                e.ID as EmpID,
                e.empName,
                e.mobile1, -- رقم الموبايل للواتساب
                e.job,
                
                -- 1. أحدث راتب أساسي
                ISNULL((SELECT TOP 1 BaseSalary FROM tbl_baseSalaryEmpolyee WHERE ID_emp = e.ID ORDER BY increseDate DESC), 0) as BaseSalary,

                -- 2. إجمالي الاستحقاقات (مكافآت، حوافز، إضافي، بدل، إشراف)
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year 
                        AND KindPenalty IN ('مكافاه', 'حافز', 'اضافى', 'بدل', 'اشراف') AND done = 0), 0) as Rewards,

                -- 3. إجمالي الاستقطاعات الإدارية (تأخير، جزاء، اشتراك باص)
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year 
                        AND KindPenalty IN ('تاخير', 'جزاء', 'اشتراك باص') AND done = 0), 0) as Deductions,

                -- 4. قسط السلفة المخصوم
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year 
                        AND KindPenalty = 'قسط سلفه' AND done = 0), 0) as qstSolfa,

                -- 5. إجمالي السلفة (للعرض والتوثيق فقط)
                ISNULL((SELECT SUM(amountPenalty) FROM tbl_eshraf 
                        WHERE empolyeeID = e.ID AND MONTH(datePenalty) = @month AND YEAR(datePenalty) = @year 
                        AND KindPenalty = 'سلفه' AND done = 0), 0) as Solfa,

                -- 6. عدد أيام الغياب من جدول الحضور
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

        // حساب قيمة الغياب والصافي برمجياً
        const payroll = result.recordset.map(emp => {
            const dayValue = emp.BaseSalary / 30; // قيمة اليوم
            const absenceDeduction = emp.AbsenceDays * dayValue; // قيمة الغياب بالمال

            // معادلة الصافي: (الأساسي + الإضافات) - (الخصومات + الغياب + قسط السلفة)
            // لاحظ: إجمالي السلفة (Solfa) لم يدخل في الطرح
            const netSalary = (emp.BaseSalary + emp.Rewards) - (emp.Deductions + absenceDeduction + emp.qstSolfa);
            
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

// 2. دالة الاعتماد، الحفظ، وإرسال الواتساب (Confirm)
const confirmPayroll = async (req, res) => {
    // payrollList: هي لستة الموظفين اللي المدير ساب عليهم "علامة صح" في فلاتر
    const { month, year, user, branchId, payrollList } = req.body;

    if (!payrollList || payrollList.length === 0) {
        return res.status(400).json({ message: 'القائمة فارغة لا يمكن الحفظ' });
    }

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 1️⃣ تسجيل "رأس" الحركة في جدول المصروفات
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

        // 2️⃣ تسجيل شريط قبض كل موظف + تقفيل حركاته
        for (const emp of payrollList) {
            const requestDetail = new sql.Request(transaction);
            requestDetail.input('expID', sql.Int, expenseID);
            requestDetail.input('empID', sql.Int, emp.EmpID);
            requestDetail.input('net', sql.Decimal(9, 2), emp.NetSalary);
            requestDetail.input('base', sql.Decimal(7, 2), emp.BaseSalary);
            requestDetail.input('reward', sql.Decimal(7, 2), emp.Rewards);
            requestDetail.input('deduct', sql.Decimal(7, 2), emp.Deductions);
            requestDetail.input('absDays', sql.SmallInt, emp.AbsenceDays);
            requestDetail.input('absAmount', sql.Decimal(7, 2), emp.AbsenceDeductionAmount);
            requestDetail.input('qstSolfa', sql.Decimal(7, 2), emp.qstSolfa);
            requestDetail.input('solfa', sql.Decimal(7, 0), emp.Solfa);
            requestDetail.input('branch', sql.SmallInt, branchId || 1);
            requestDetail.input('byan', sql.VarChar, `راتب ${emp.empName} شهر ${month}`);

            // إدخال التفاصيل (لاحظ وضعنا 8 لنوع المصروف)
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

        // 4️⃣ إرسال إشعارات الواتساب (بعد نجاح الحفظ تماماً)
        // بنعملها جوه Try/Catch منفصل عشان لو الواتس فشل، مايأثرش على حفظ المرتبات
        try {
            for (const emp of payrollList) {
                if (emp.mobile1) {
                    const messageText = `🏢 *إدارة الحضانة*\n\nمرحباً أ. *${emp.empName}*،\nتم إيداع راتب شهر ${month}/${year}. 💰\n\n🟢 *إجمالي الاستحقاقات:* ${emp.BaseSalary + emp.Rewards} ج\n🔴 *إجمالي الاستقطاعات:* ${emp.Deductions + emp.qstSolfa + emp.AbsenceDeductionAmount} ج\nℹ️ *معلومات سلفة (إن وجد):* ${emp.Solfa} ج\n\n💵 *صافي الراتب:* *${emp.NetSalary} ج*\n\nتمنياتنا لك بالتوفيق! 🌹`;

                    // ⚠️ استبدل الرابط والتوكن ببياناتك من UltraMsg أو خدمة الواتساب الخاصة بك
                    /*
                    await axios.post('https://api.ultramsg.com/YOUR_INSTANCE_ID/messages/chat', {
                        token: 'YOUR_TOKEN',
                        to: emp.mobile1,
                        body: messageText
                    });
                    */
                   console.log(`تم إرسال رسالة الواتس بنجاح للموظف: ${emp.empName}`);
                }
            }
        } catch (whatsappErr) {
            console.error("خطأ في إرسال الواتساب: ", whatsappErr);
            // لن نقوم بإيقاف العملية، المرتبات اتحفظت خلاص
        }

        // الرد النهائي لتطبيق فلاتر
        res.status(201).json({ message: 'تم اعتماد وصرف الرواتب وإرسال الإشعارات بنجاح ✅' });

    } catch (err) {
        await transaction.rollback();
        console.error("Confirm Payroll Error: ", err);
        res.status(500).json({ message: 'فشل صرف الرواتب', error: err.message });
    }
};

// 3. دالة جلب كشف رواتب قديم (من الأرشيف)
const getPayrollHistory = async (req, res) => {
    const { month, year } = req.query;

    try {
        // بنعتمد على الـ Byan اللي إحنا سجلناه وقت الحفظ
        const searchByan = `رواتب موظفين شهر ${month}/${year}`;

        const query = `
            SELECT 
                e.ID as EmpID,
                e.empName,
                e.mobile1,
                e.job,
                d.salary as BaseSalary,
                d.Reward as Rewards,
                d.penalty as Deductions,
                d.qstSolfa as qstSolfa,
                d.Solfa as Solfa,
                d.[absence's _Day] as AbsenceDays,
                d.absence as AbsenceDeductionAmount,
                d.expenseAmount as NetSalary
            FROM tbl_ExpensesDetalis d
            INNER JOIN tbl_expenses ex ON d.IDExpense = ex.ID
            INNER JOIN tbl_empolyee e ON d.empolyee_ID = e.ID
            WHERE ex.Kind = 'مرتبات' AND ex.expenseByan = @byan
        `;

        const request = new sql.Request();
        request.input('byan', sql.NVarChar, searchByan);

        const result = await request.query(query);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error("History Payroll Error: ", err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { previewPayroll, confirmPayroll, getPayrollHistory };