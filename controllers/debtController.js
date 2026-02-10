const { sql } = require('../config/db');
const { createAndPushNotification } = require('./notificationController');

const EGYPT_TIME = "GETUTCDATE() AT TIME ZONE 'UTC' AT TIME ZONE 'Egypt Standard Time'";

// ═══════════════════════════════════════════════════════════════
// 1. جلب مديونيات كل الأطفال حسب العام المالي
// ═══════════════════════════════════════════════════════════════
const getAllDebts = async (req, res) => {
    const { sessionId } = req.params;

    try {
        const request = new sql.Request();
        request.input('sessionId', sql.SmallInt, sessionId);

        const result = await request.query(`
            SELECT 
                f.ID as financeId,
                f.Child_Id,
                f.Kind_subscrip,
                f.amountBase,
                f.discount,
                f.amount_Sub,
                f.SessionID,
                c.FullNameArabic,
                c.Branch,
                b.branchName,
                s.Sessions as SessionName,

                -- إجمالي المدفوع (اشتراك دراسة kindId=6)
                ISNULL((
                    SELECT SUM(d.incomeAmount) 
                    FROM tbl_incomeDetalis d 
                    WHERE d.child_ID = f.Child_Id 
                      AND d.incomeSessiontxt = f.SessionID
                      AND d.incomeKind = CASE 
                          WHEN f.Kind_subscrip = N'اشتراك الدراسة السنوى' THEN 6
                          WHEN f.Kind_subscrip = N'اشتراك الباص' THEN 7
                          ELSE 0 END
                ), 0) as totalPaid,

                -- عدد الأقساط الكلي
                ISNULL((
                    SELECT COUNT(*) 
                    FROM tbl_PaymentsChild p 
                    WHERE p.PaymentID = f.ID
                ), 0) as totalInstallments,

                -- عدد الأقساط المدفوعة
                ISNULL((
                    SELECT COUNT(*) 
                    FROM tbl_PaymentsChild p 
                    WHERE p.PaymentID = f.ID AND p.PaymentDone = 1
                ), 0) as paidInstallments,

                -- أقرب قسط غير مدفوع
                (
                    SELECT TOP 1 p.MonthPayment 
                    FROM tbl_PaymentsChild p 
                    WHERE p.PaymentID = f.ID AND p.PaymentDone = 0
                    ORDER BY p.MonthPayment ASC
                ) as nextInstallmentDate,

                -- مبلغ أقرب قسط غير مدفوع
                (
                    SELECT TOP 1 p.amountPyment 
                    FROM tbl_PaymentsChild p 
                    WHERE p.PaymentID = f.ID AND p.PaymentDone = 0
                    ORDER BY p.MonthPayment ASC
                ) as nextInstallmentAmount

            FROM tbl_FinanceChild f
            LEFT JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            LEFT JOIN tbl_Sessions s ON f.SessionID = s.IDSession
            WHERE f.SessionID = @sessionId
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
            ORDER BY c.FullNameArabic
        `);

        res.status(200).json({
            success: true,
            data: result.recordset
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب المديونيات',
            error: err.message
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// 2. جلب تفاصيل مديونية طفل واحد
// ═══════════════════════════════════════════════════════════════
const getChildDebtDetails = async (req, res) => {
    const { childId, sessionId } = req.params;

    try {
        const request = new sql.Request();
        request.input('childId', sql.Int, childId);
        request.input('sessionId', sql.SmallInt, sessionId);

        // 1️⃣ بيانات الاشتراكات
        const financeResult = await request.query(`
            SELECT 
                f.ID as financeId,
                f.Kind_subscrip,
                f.amountBase,
                f.discount,
                f.amount_Sub,
                c.FullNameArabic,
                c.Branch,
                b.branchName,
                c.FatherName,
                c.FatherMobile1,
                c.MotherName,
                c.MotherMobile1,
                v.ClassName
            FROM tbl_FinanceChild f
            LEFT JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            LEFT JOIN vw_ChildrenCurrentClass v ON c.ID_Child = v.ID_Child
            WHERE f.Child_Id = @childId 
              AND f.SessionID = @sessionId
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
        `);

        if (financeResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'لا يوجد اشتراكات لهذا الطفل'
            });
        }

        // 2️⃣ لكل اشتراك نجيب الأقساط والمدفوعات
        const details = [];

        for (const finance of financeResult.recordset) {
            // الأقساط
            const installmentsRequest = new sql.Request();
            installmentsRequest.input('financeId', sql.Int, finance.financeId);

            const installments = await installmentsRequest.query(`
                SELECT 
                    ID,
                    MonthPayment,
                    amountPyment,
                    PaymentDone,
                    PaymentNotes
                FROM tbl_PaymentsChild
                WHERE PaymentID = @financeId
                ORDER BY MonthPayment ASC
            `);

            // المدفوعات من الإيرادات
            const paymentsRequest = new sql.Request();
            paymentsRequest.input('childId', sql.Int, childId);
            paymentsRequest.input('sessionId', sql.SmallInt, sessionId);
            paymentsRequest.input('kindId', sql.SmallInt,
                finance.Kind_subscrip === 'اشتراك الدراسة السنوى' ? 6 : 7
            );

            const payments = await paymentsRequest.query(`
                SELECT 
                    d.incomeAmount,
                    d.date_Pay,
                    d.ReceiptNumber,
                    d.Notes,
                    i.userAdd
                FROM tbl_incomeDetalis d
                LEFT JOIN tbl_income i ON d.IDincome = i.ID
                WHERE d.child_ID = @childId
                  AND d.incomeSessiontxt = @sessionId
                  AND d.incomeKind = @kindId
                ORDER BY d.date_Pay ASC
            `);

            const totalPaid = payments.recordset.reduce(
                (sum, p) => sum + parseFloat(p.incomeAmount || 0), 0
            );

            details.push({
                finance: finance,
                installments: installments.recordset,
                payments: payments.recordset,
                summary: {
                    totalAmount: parseFloat(finance.amount_Sub || 0),
                    totalPaid: totalPaid,
                    remaining: Math.max(0, parseFloat(finance.amount_Sub || 0) - totalPaid)
                }
            });
        }

        res.status(200).json({
            success: true,
            data: details
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب التفاصيل',
            error: err.message
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// 3. فحص الأقساط المتأخرة وإرسال إشعارات
// ═══════════════════════════════════════════════════════════════
const checkOverdueInstallments = async (req, res) => {
    try {
        const request = new sql.Request();

        // 1️⃣ الأقساط المتأخرة (تاريخها عدى ومتدفعتش)
        const overdueResult = await request.query(`
            SELECT 
                p.ID as installmentId,
                p.MonthPayment,
                p.amountPyment,
                f.Child_Id,
                c.FullNameArabic,
                f.Kind_subscrip,
                DATEDIFF(DAY, p.MonthPayment, ${EGYPT_TIME}) as daysLate
            FROM tbl_PaymentsChild p
            INNER JOIN tbl_FinanceChild f ON p.PaymentID = f.ID
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            WHERE p.PaymentDone = 0
              AND p.MonthPayment < CAST(${EGYPT_TIME} AS DATE)
            ORDER BY p.MonthPayment ASC
        `);

        // 2️⃣ الأقساط القادمة خلال 3 أيام
        const upcomingResult = await sql.query(`
            SELECT 
                p.ID as installmentId,
                p.MonthPayment,
                p.amountPyment,
                f.Child_Id,
                c.FullNameArabic,
                f.Kind_subscrip,
                DATEDIFF(DAY, CAST(${EGYPT_TIME} AS DATE), p.MonthPayment) as daysUntil
            FROM tbl_PaymentsChild p
            INNER JOIN tbl_FinanceChild f ON p.PaymentID = f.ID
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            WHERE p.PaymentDone = 0
              AND p.MonthPayment >= CAST(${EGYPT_TIME} AS DATE)
              AND p.MonthPayment <= DATEADD(DAY, 3, CAST(${EGYPT_TIME} AS DATE))
            ORDER BY p.MonthPayment ASC
        `);

        // 3️⃣ جلب المديرين والمحاسبين
        const adminsResult = await sql.query(`
            SELECT UserId FROM tbl_users 
            WHERE Role IN ('Admin', 'AccountantUser')
        `);

        let notificationsSent = 0;

        // 4️⃣ إرسال إشعارات الأقساط المتأخرة
        for (const overdue of overdueResult.recordset) {
            for (const admin of adminsResult.recordset) {
                await createAndPushNotification(
                    admin.UserId,
                    '⚠️ قسط متأخر',
                    `${overdue.FullNameArabic} - ${overdue.Kind_subscrip} - مبلغ ${overdue.amountPyment} ج.م متأخر ${overdue.daysLate} يوم`,
                    'Debt',
                    'installment',
                    overdue.installmentId
                );
                notificationsSent++;
            }
        }

        // 5️⃣ إرسال إشعارات الأقساط القادمة
        for (const upcoming of upcomingResult.recordset) {
            for (const admin of adminsResult.recordset) {
                await createAndPushNotification(
                    admin.UserId,
                    '🔔 تذكير بقسط قادم',
                    `${upcoming.FullNameArabic} - ${upcoming.Kind_subscrip} - مبلغ ${upcoming.amountPyment} ج.م بعد ${upcoming.daysUntil} يوم`,
                    'Reminder',
                    'installment',
                    upcoming.installmentId
                );
                notificationsSent++;
            }
        }

        res.status(200).json({
            success: true,
            message: `تم فحص الأقساط وإرسال ${notificationsSent} إشعار`,
            data: {
                overdueCount: overdueResult.recordset.length,
                upcomingCount: upcomingResult.recordset.length,
                notificationsSent: notificationsSent
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'خطأ في فحص الأقساط',
            error: err.message
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// 4. مؤشرات الأداء المالي (KPI Dashboard)
// ═══════════════════════════════════════════════════════════════
const getFinancialKPIs = async (req, res) => {
    const { sessionId } = req.params;

    try {
        const request = new sql.Request();
        request.input('sessionId', sql.SmallInt, sessionId);

        // 1️⃣ التحصيل الشهري
        const monthlyResult = await request.query(`
            SELECT 
                MONTH(d.date_Pay) as payMonth,
                YEAR(d.date_Pay) as payYear,
                SUM(d.incomeAmount) as totalAmount,
                COUNT(DISTINCT d.child_ID) as childrenCount
            FROM tbl_incomeDetalis d
            WHERE d.incomeSessiontxt = @sessionId
              AND d.incomeKind IN (6, 7)
              AND d.date_Pay IS NOT NULL
            GROUP BY MONTH(d.date_Pay), YEAR(d.date_Pay)
            ORDER BY YEAR(d.date_Pay), MONTH(d.date_Pay)
        `);

        // 2️⃣ مقارنة الفروع
        const request2 = new sql.Request();
        request2.input('sessionId', sql.SmallInt, sessionId);

        const branchResult = await request2.query(`
            SELECT 
                b.IDbranch as branchId,
                b.branchName,
                COUNT(DISTINCT f.Child_Id) as totalChildren,
                SUM(f.amount_Sub) as totalRequired,
                ISNULL((
                    SELECT SUM(d.incomeAmount)
                    FROM tbl_incomeDetalis d
                    INNER JOIN tbl_FinanceChild fc ON d.child_ID = fc.Child_Id 
                        AND d.incomeSessiontxt = fc.SessionID
                    WHERE fc.SessionID = @sessionId
                      AND d.incomeKind IN (6, 7)
                      AND d.incomBranchtxt = b.IDbranch
                      AND d.incomeSessiontxt = @sessionId
                ), 0) as totalPaid
            FROM tbl_FinanceChild f
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            INNER JOIN tbl_Branch b ON c.Branch = b.IDbranch
            WHERE f.SessionID = @sessionId
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
            GROUP BY b.IDbranch, b.branchName
            ORDER BY b.branchName
        `);

        // 3️⃣ مقارنة الاشتراكات (دراسة vs باص)
        const request3 = new sql.Request();
        request3.input('sessionId', sql.SmallInt, sessionId);

        const typeResult = await request3.query(`
            SELECT 
                f.Kind_subscrip,
                COUNT(DISTINCT f.Child_Id) as totalChildren,
                SUM(f.amount_Sub) as totalRequired,
                ISNULL((
                    SELECT SUM(d.incomeAmount)
                    FROM tbl_incomeDetalis d
                    WHERE d.child_ID IN (
                        SELECT Child_Id FROM tbl_FinanceChild 
                        WHERE SessionID = @sessionId 
                        AND Kind_subscrip = f.Kind_subscrip
                    )
                    AND d.incomeSessiontxt = @sessionId
                    AND d.incomeKind = CASE 
                        WHEN f.Kind_subscrip = N'اشتراك الدراسة السنوى' THEN 6
                        WHEN f.Kind_subscrip = N'اشتراك الباص' THEN 7
                        ELSE 0 END
                ), 0) as totalPaid
            FROM tbl_FinanceChild f
            WHERE f.SessionID = @sessionId
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
            GROUP BY f.Kind_subscrip
        `);

        // 4️⃣ أكتر المتأخرين
        const request4 = new sql.Request();
        request4.input('sessionId', sql.SmallInt, sessionId);

        const topDebtorsResult = await request4.query(`
            SELECT TOP 10
                f.Child_Id,
                c.FullNameArabic,
                b.branchName,
                f.Kind_subscrip,
                f.amount_Sub as totalRequired,
                ISNULL((
                    SELECT SUM(d.incomeAmount)
                    FROM tbl_incomeDetalis d
                    WHERE d.child_ID = f.Child_Id
                      AND d.incomeSessiontxt = @sessionId
                      AND d.incomeKind = CASE 
                          WHEN f.Kind_subscrip = N'اشتراك الدراسة السنوى' THEN 6
                          WHEN f.Kind_subscrip = N'اشتراك الباص' THEN 7
                          ELSE 0 END
                ), 0) as totalPaid,
                (
                    SELECT TOP 1 DATEDIFF(DAY, p.MonthPayment, GETDATE())
                    FROM tbl_PaymentsChild p
                    WHERE p.PaymentID = f.ID 
                      AND p.PaymentDone = 0
                      AND p.MonthPayment < GETDATE()
                    ORDER BY p.MonthPayment ASC
                ) as daysLate
            FROM tbl_FinanceChild f
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            WHERE f.SessionID = @sessionId
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
            ORDER BY daysLate DESC
        `);

        // 5️⃣ المديونين لكل شهر (للتقويم)
        const request5 = new sql.Request();
        request5.input('sessionId', sql.SmallInt, sessionId);

        const calendarResult = await request5.query(`
            SELECT 
                MONTH(p.MonthPayment) as installmentMonth,
                YEAR(p.MonthPayment) as installmentYear,
                COUNT(DISTINCT f.Child_Id) as debtorsCount,
                SUM(p.amountPyment) as totalAmount,
                SUM(CASE WHEN p.PaymentDone = 1 THEN 1 ELSE 0 END) as paidCount,
                SUM(CASE WHEN p.PaymentDone = 0 THEN 1 ELSE 0 END) as unpaidCount,
                SUM(CASE WHEN p.PaymentDone = 0 THEN p.amountPyment ELSE 0 END) as unpaidAmount
            FROM tbl_PaymentsChild p
            INNER JOIN tbl_FinanceChild f ON p.PaymentID = f.ID
            WHERE f.SessionID = @sessionId
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
            GROUP BY MONTH(p.MonthPayment), YEAR(p.MonthPayment)
            ORDER BY YEAR(p.MonthPayment), MONTH(p.MonthPayment)
        `);

        // 6️⃣ إحصائيات عامة
        const request6 = new sql.Request();
        request6.input('sessionId', sql.SmallInt, sessionId);

        const generalResult = await request6.query(`
            SELECT 
                COUNT(DISTINCT f.Child_Id) as totalChildren,
                SUM(f.amount_Sub) as totalRequired,
                ISNULL((
                    SELECT SUM(d.incomeAmount)
                    FROM tbl_incomeDetalis d
                    WHERE d.incomeSessiontxt = @sessionId
                      AND d.incomeKind IN (6, 7)
                ), 0) as totalPaid,
                ISNULL((
                    SELECT AVG(CAST(daysLate as FLOAT))
                    FROM (
                        SELECT DATEDIFF(DAY, p.MonthPayment, GETDATE()) as daysLate
                        FROM tbl_PaymentsChild p
                        INNER JOIN tbl_FinanceChild f2 ON p.PaymentID = f2.ID
                        WHERE f2.SessionID = @sessionId
                          AND p.PaymentDone = 0
                          AND p.MonthPayment < GETDATE()
                    ) sub
                ), 0) as avgDaysLate
            FROM tbl_FinanceChild f
            WHERE f.SessionID = @sessionId
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
        `);

        const general = generalResult.recordset[0];
        const totalRequired = parseFloat(general.totalRequired || 0);
        const totalPaid = parseFloat(general.totalPaid || 0);
        const remaining = totalRequired - totalPaid;
        const collectionRate = totalRequired > 0 ? ((totalPaid / totalRequired) * 100).toFixed(1) : 0;

        res.status(200).json({
            success: true,
            data: {
                general: {
                    totalChildren: general.totalChildren,
                    totalRequired: totalRequired,
                    totalPaid: totalPaid,
                    remaining: remaining > 0 ? remaining : 0,
                    collectionRate: parseFloat(collectionRate),
                    avgDaysLate: Math.round(general.avgDaysLate || 0)
                },
                monthly: monthlyResult.recordset,
                branches: branchResult.recordset,
                types: typeResult.recordset,
                topDebtors: topDebtorsResult.recordset.filter(d => d.daysLate > 0),
                calendar: calendarResult.recordset
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب مؤشرات الأداء',
            error: err.message
        });
    }
};
    // ═══════════════════════════════════════════════════════════════
// 5. مؤشرات الأداء المالي المتقدمة (Advanced KPI)
// ═══════════════════════════════════════════════════════════════
const getAdvancedKPIs = async (req, res) => {
    const { sessionId } = req.params;
    const { branchId, type } = req.query; // فلاتر اختيارية

    try {
        const request = new sql.Request();
        request.input('sessionId', sql.SmallInt, sessionId);

        // بناء شروط الفلترة
        let branchCondition = '';
        let typeCondition = '';
        let incomeKindCondition = 'AND d.incomeKind IN (6, 7)';

        if (branchId && branchId !== 'null') {
            request.input('branchId', sql.Int, branchId);
            branchCondition = 'AND c.Branch = @branchId';
        }

        if (type === 'study') {
            typeCondition = `AND f.Kind_subscrip = N'اشتراك الدراسة السنوى'`;
            incomeKindCondition = 'AND d.incomeKind = 6';
        } else if (type === 'bus') {
            typeCondition = `AND f.Kind_subscrip = N'اشتراك الباص'`;
            incomeKindCondition = 'AND d.incomeKind = 7';
        }

        // ═══════════ 1. الملخص العام ═══════════
        const generalResult = await request.query(`
            SELECT 
                COUNT(DISTINCT f.Child_Id) as totalChildren,
                SUM(f.amount_Sub) as totalRequired,
                SUM(f.discount) as totalDiscounts,
                SUM(f.amountBase) as totalBase,

                -- المسددين بالكامل
                (SELECT COUNT(DISTINCT f2.Child_Id)
                 FROM tbl_FinanceChild f2
                 INNER JOIN tbl_Child c2 ON f2.Child_Id = c2.ID_Child
                 WHERE f2.SessionID = @sessionId
                   ${typeCondition.replace('f.', 'f2.')}
                   ${branchCondition.replace('c.', 'c2.')}
                   AND f2.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
                   AND ISNULL((
                       SELECT SUM(d.incomeAmount) FROM tbl_incomeDetalis d
                       WHERE d.child_ID = f2.Child_Id
                         AND d.incomeSessiontxt = @sessionId
                         AND d.incomeKind IN (6,7)
                   ), 0) >= f2.amount_Sub
                ) as paidFullCount,

                -- عدد الأقساط المتأخرة
                (SELECT COUNT(*)
                 FROM tbl_PaymentsChild p
                 INNER JOIN tbl_FinanceChild f3 ON p.PaymentID = f3.ID
                 INNER JOIN tbl_Child c3 ON f3.Child_Id = c3.ID_Child
                 WHERE f3.SessionID = @sessionId
                   AND p.PaymentDone = 0
                   AND p.MonthPayment < CAST(GETDATE() AS DATE)
                   ${typeCondition.replace('f.', 'f3.')}
                   ${branchCondition.replace('c.', 'c3.')}
                ) as overdueInstallments,

                -- عدد الأقساط القادمة خلال 7 أيام
                (SELECT COUNT(*)
                 FROM tbl_PaymentsChild p
                 INNER JOIN tbl_FinanceChild f4 ON p.PaymentID = f4.ID
                 INNER JOIN tbl_Child c4 ON f4.Child_Id = c4.ID_Child
                 WHERE f4.SessionID = @sessionId
                   AND p.PaymentDone = 0
                   AND p.MonthPayment >= CAST(GETDATE() AS DATE)
                   AND p.MonthPayment <= DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
                   ${typeCondition.replace('f.', 'f4.')}
                   ${branchCondition.replace('c.', 'c4.')}
                ) as upcomingInstallments,

                -- إجمالي مبالغ الأقساط القادمة 7 أيام
                (SELECT ISNULL(SUM(p.amountPyment), 0)
                 FROM tbl_PaymentsChild p
                 INNER JOIN tbl_FinanceChild f5 ON p.PaymentID = f5.ID
                 INNER JOIN tbl_Child c5 ON f5.Child_Id = c5.ID_Child
                 WHERE f5.SessionID = @sessionId
                   AND p.PaymentDone = 0
                   AND p.MonthPayment >= CAST(GETDATE() AS DATE)
                   AND p.MonthPayment <= DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
                   ${typeCondition.replace('f.', 'f5.')}
                   ${branchCondition.replace('c.', 'c5.')}
                ) as upcomingAmount,

                -- متوسط أيام التأخير
                ISNULL((
                    SELECT AVG(CAST(DATEDIFF(DAY, p.MonthPayment, GETDATE()) AS FLOAT))
                    FROM tbl_PaymentsChild p
                    INNER JOIN tbl_FinanceChild f6 ON p.PaymentID = f6.ID
                    INNER JOIN tbl_Child c6 ON f6.Child_Id = c6.ID_Child
                    WHERE f6.SessionID = @sessionId
                      AND p.PaymentDone = 0
                      AND p.MonthPayment < GETDATE()
                      ${typeCondition.replace('f.', 'f6.')}
                      ${branchCondition.replace('c.', 'c6.')}
                ), 0) as avgDaysLate

            FROM tbl_FinanceChild f
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            WHERE f.SessionID = @sessionId
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
              ${typeCondition}
              ${branchCondition}
        `);

        // ═══════════ 2. إجمالي المدفوع ═══════════
        const request2 = new sql.Request();
        request2.input('sessionId', sql.SmallInt, sessionId);
        if (branchId && branchId !== 'null') {
            request2.input('branchId', sql.Int, branchId);
        }

        const paidResult = await request2.query(`
            SELECT ISNULL(SUM(d.incomeAmount), 0) as totalPaid
            FROM tbl_incomeDetalis d
            INNER JOIN tbl_Child c ON d.child_ID = c.ID_Child
            WHERE d.incomeSessiontxt = @sessionId
              ${incomeKindCondition}
              ${branchCondition}
        `);

        // ═══════════ 3. أداء الفروع (مع تفصيل دراسة وباص لكل فرع) ═══════════
const request3 = new sql.Request();
request3.input('sessionId', sql.SmallInt, sessionId);

const branchResult = await request3.query(`
    SELECT 
        b.IDbranch as branchId,
        b.branchName,
        COUNT(DISTINCT f.Child_Id) as totalChildren,
        SUM(f.amount_Sub) as totalRequired,
        
        -- إجمالي المدفوع للفرع
        ISNULL((
            SELECT SUM(d.incomeAmount)
            FROM tbl_incomeDetalis d
            WHERE d.child_ID IN (
                SELECT fc.Child_Id FROM tbl_FinanceChild fc
                INNER JOIN tbl_Child cc ON fc.Child_Id = cc.ID_Child
                WHERE fc.SessionID = @sessionId AND cc.Branch = b.IDbranch
                  AND fc.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
            )
            AND d.incomeSessiontxt = @sessionId
            AND d.incomeKind IN (6, 7)
        ), 0) as totalPaid,

        -- المتأخرين في الفرع
        (SELECT COUNT(DISTINCT f2.Child_Id)
         FROM tbl_PaymentsChild p
         INNER JOIN tbl_FinanceChild f2 ON p.PaymentID = f2.ID
         INNER JOIN tbl_Child c2 ON f2.Child_Id = c2.ID_Child
         WHERE f2.SessionID = @sessionId
           AND p.PaymentDone = 0
           AND p.MonthPayment < CAST(GETDATE() AS DATE)
           AND c2.Branch = b.IDbranch
        ) as overdueChildren,

        -- ═══ دراسة: المطلوب ═══
        ISNULL((
            SELECT SUM(fc.amount_Sub)
            FROM tbl_FinanceChild fc
            INNER JOIN tbl_Child cc ON fc.Child_Id = cc.ID_Child
            WHERE fc.SessionID = @sessionId
              AND cc.Branch = b.IDbranch
              AND fc.Kind_subscrip = N'اشتراك الدراسة السنوى'
        ), 0) as studyRequired,

        -- ═══ دراسة: المدفوع ═══
        ISNULL((
            SELECT SUM(d.incomeAmount)
            FROM tbl_incomeDetalis d
            INNER JOIN tbl_Child cc ON d.child_ID = cc.ID_Child
            WHERE d.incomeSessiontxt = @sessionId
              AND d.incomeKind = 6
              AND cc.Branch = b.IDbranch
        ), 0) as studyPaid,

        -- ═══ دراسة: عدد الطلاب ═══
        ISNULL((
            SELECT COUNT(DISTINCT fc.Child_Id)
            FROM tbl_FinanceChild fc
            INNER JOIN tbl_Child cc ON fc.Child_Id = cc.ID_Child
            WHERE fc.SessionID = @sessionId
              AND cc.Branch = b.IDbranch
              AND fc.Kind_subscrip = N'اشتراك الدراسة السنوى'
        ), 0) as studyChildren,

        -- ═══ باص: المطلوب ═══
        ISNULL((
            SELECT SUM(fc.amount_Sub)
            FROM tbl_FinanceChild fc
            INNER JOIN tbl_Child cc ON fc.Child_Id = cc.ID_Child
            WHERE fc.SessionID = @sessionId
              AND cc.Branch = b.IDbranch
              AND fc.Kind_subscrip = N'اشتراك الباص'
        ), 0) as busRequired,

        -- ═══ باص: المدفوع ═══
        ISNULL((
            SELECT SUM(d.incomeAmount)
            FROM tbl_incomeDetalis d
            INNER JOIN tbl_Child cc ON d.child_ID = cc.ID_Child
            WHERE d.incomeSessiontxt = @sessionId
              AND d.incomeKind = 7
              AND cc.Branch = b.IDbranch
        ), 0) as busPaid,

        -- ═══ باص: عدد الطلاب ═══
        ISNULL((
            SELECT COUNT(DISTINCT fc.Child_Id)
            FROM tbl_FinanceChild fc
            INNER JOIN tbl_Child cc ON fc.Child_Id = cc.ID_Child
            WHERE fc.SessionID = @sessionId
              AND cc.Branch = b.IDbranch
              AND fc.Kind_subscrip = N'اشتراك الباص'
        ), 0) as busChildren

    FROM tbl_FinanceChild f
    INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
    INNER JOIN tbl_Branch b ON c.Branch = b.IDbranch
    WHERE f.SessionID = @sessionId
      AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
      ${typeCondition}
    GROUP BY b.IDbranch, b.branchName
    ORDER BY b.branchName
`);

        // ═══════════ 4. مقارنة دراسة vs باص ═══════════
        const request4 = new sql.Request();
        request4.input('sessionId', sql.SmallInt, sessionId);
        if (branchId && branchId !== 'null') {
            request4.input('branchId', sql.Int, branchId);
        }

        const typeResult = await request4.query(`
            SELECT 
                f.Kind_subscrip,
                COUNT(DISTINCT f.Child_Id) as totalChildren,
                SUM(f.amount_Sub) as totalRequired,
                ISNULL((
                    SELECT SUM(d.incomeAmount)
                    FROM tbl_incomeDetalis d
                    INNER JOIN tbl_Child cd ON d.child_ID = cd.ID_Child
                    WHERE d.child_ID IN (
                        SELECT Child_Id FROM tbl_FinanceChild 
                        WHERE SessionID = @sessionId 
                        AND Kind_subscrip = f.Kind_subscrip
                    )
                    AND d.incomeSessiontxt = @sessionId
                    AND d.incomeKind = CASE 
                        WHEN f.Kind_subscrip = N'اشتراك الدراسة السنوى' THEN 6
                        WHEN f.Kind_subscrip = N'اشتراك الباص' THEN 7
                        ELSE 0 END
                    ${branchCondition.replace('c.', 'cd.')}
                ), 0) as totalPaid
            FROM tbl_FinanceChild f
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            WHERE f.SessionID = @sessionId
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
              ${branchCondition}
            GROUP BY f.Kind_subscrip
        `);

        // ═══════════ 5. التحصيل الشهري ═══════════
        const request5 = new sql.Request();
        request5.input('sessionId', sql.SmallInt, sessionId);
        if (branchId && branchId !== 'null') {
            request5.input('branchId', sql.Int, branchId);
        }

        const monthlyResult = await request5.query(`
            SELECT 
                MONTH(d.date_Pay) as payMonth,
                YEAR(d.date_Pay) as payYear,
                SUM(d.incomeAmount) as totalAmount,
                COUNT(DISTINCT d.child_ID) as childrenCount
            FROM tbl_incomeDetalis d
            INNER JOIN tbl_Child c ON d.child_ID = c.ID_Child
            WHERE d.incomeSessiontxt = @sessionId
              ${incomeKindCondition}
              AND d.date_Pay IS NOT NULL
              ${branchCondition}
            GROUP BY MONTH(d.date_Pay), YEAR(d.date_Pay)
            ORDER BY YEAR(d.date_Pay), MONTH(d.date_Pay)
        `);

        // ═══════════ 6. أكثر 10 متأخرين ═══════════
        const request6 = new sql.Request();
        request6.input('sessionId', sql.SmallInt, sessionId);
        if (branchId && branchId !== 'null') {
            request6.input('branchId', sql.Int, branchId);
        }

        const topDebtorsResult = await request6.query(`
            SELECT TOP 10
                f.Child_Id,
                c.FullNameArabic,
                b.branchName,
                f.Kind_subscrip,
                f.amount_Sub as totalRequired,
                ISNULL((
                    SELECT SUM(d.incomeAmount)
                    FROM tbl_incomeDetalis d
                    WHERE d.child_ID = f.Child_Id
                      AND d.incomeSessiontxt = @sessionId
                      AND d.incomeKind = CASE 
                          WHEN f.Kind_subscrip = N'اشتراك الدراسة السنوى' THEN 6
                          WHEN f.Kind_subscrip = N'اشتراك الباص' THEN 7
                          ELSE 0 END
                ), 0) as totalPaid,
                (
                    SELECT TOP 1 DATEDIFF(DAY, p.MonthPayment, GETDATE())
                    FROM tbl_PaymentsChild p
                    WHERE p.PaymentID = f.ID 
                      AND p.PaymentDone = 0
                      AND p.MonthPayment < GETDATE()
                    ORDER BY p.MonthPayment ASC
                ) as daysLate,
                c.FatherMobile1,
                c.MotherMobile1
            FROM tbl_FinanceChild f
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            WHERE f.SessionID = @sessionId
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
              ${typeCondition}
              ${branchCondition}
            ORDER BY daysLate DESC
        `);

        // ═══════════ تجميع النتيجة النهائية ═══════════
        const general = generalResult.recordset[0];
        const totalPaid = parseFloat(paidResult.recordset[0].totalPaid || 0);
        const totalRequired = parseFloat(general.totalRequired || 0);
        const remaining = Math.max(0, totalRequired - totalPaid);
        const collectionRate = totalRequired > 0 
            ? ((totalPaid / totalRequired) * 100).toFixed(1) : 0;

        // حساب عدد المديونين (جزئي)
        const partialPayCount = general.totalChildren - general.paidFullCount - 
            (totalPaid === 0 ? general.totalChildren : 0);

        res.status(200).json({
            success: true,
            data: {
                general: {
                    totalChildren: general.totalChildren || 0,
                    totalRequired,
                    totalPaid,
                    remaining,
                    totalBase: parseFloat(general.totalBase || 0),
                    totalDiscounts: parseFloat(general.totalDiscounts || 0),
                    collectionRate: parseFloat(collectionRate),
                    paidFullCount: general.paidFullCount || 0,
                    partialPayCount: Math.max(0, partialPayCount),
                    overdueInstallments: general.overdueInstallments || 0,
                    upcomingInstallments: general.upcomingInstallments || 0,
                    upcomingAmount: parseFloat(general.upcomingAmount || 0),
                    avgDaysLate: Math.round(general.avgDaysLate || 0)
                },
// ✅ الجديد - حط ده مكانه
branches: branchResult.recordset.map(b => {
    const totalReq = parseFloat(b.totalRequired || 0);
    const totalPd = parseFloat(b.totalPaid || 0);
    const studyReq = parseFloat(b.studyRequired || 0);
    const studyPd = parseFloat(b.studyPaid || 0);
    const busReq = parseFloat(b.busRequired || 0);
    const busPd = parseFloat(b.busPaid || 0);

    return {
        ...b,
        totalRequired: totalReq,
        totalPaid: totalPd,
        remaining: Math.max(0, totalReq - totalPd),
        collectionRate: totalReq > 0 
            ? ((totalPd / totalReq) * 100).toFixed(1) : '0',
        
        // تفاصيل الدراسة
        studyRequired: studyReq,
        studyPaid: studyPd,
        studyRemaining: Math.max(0, studyReq - studyPd),
        studyRate: studyReq > 0 
            ? ((studyPd / studyReq) * 100).toFixed(1) : '0',
        studyChildren: b.studyChildren || 0,

        // تفاصيل الباص
        busRequired: busReq,
        busPaid: busPd,
        busRemaining: Math.max(0, busReq - busPd),
        busRate: busReq > 0 
            ? ((busPd / busReq) * 100).toFixed(1) : '0',
        busChildren: b.busChildren || 0,
    };
}),
                types: typeResult.recordset.map(t => ({
                    ...t,
                    totalRequired: parseFloat(t.totalRequired || 0),
                    totalPaid: parseFloat(t.totalPaid || 0),
                    remaining: Math.max(0, parseFloat(t.totalRequired || 0) - parseFloat(t.totalPaid || 0)),
                    collectionRate: parseFloat(t.totalRequired || 0) > 0
                        ? ((parseFloat(t.totalPaid || 0) / parseFloat(t.totalRequired || 0)) * 100).toFixed(1)
                        : 0
                })),
                monthly: monthlyResult.recordset,
                topDebtors: topDebtorsResult.recordset.filter(d => d.daysLate > 0)
            }
        });

    } catch (err) {
        console.error('KPI Error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب مؤشرات الأداء',
            error: err.message
        });
    }
};

  // ═══════════════════════════════════════════════════════════════
// 6. كليندر الأقساط الشهرية (ملخص كل شهر)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// 6. كليندر الأقساط - الأقساط المتبقية فقط
// ═══════════════════════════════════════════════════════════════
const getMonthlyCalendar = async (req, res) => {
    const { sessionId } = req.params;
    const { branchId, type } = req.query;

    try {
        const request = new sql.Request();
        request.input('sessionId', sql.SmallInt, sessionId);

        let branchCondition = '';
        let typeCondition = '';

        if (branchId && branchId !== 'null') {
            request.input('branchId', sql.Int, branchId);
            branchCondition = 'AND c.Branch = @branchId';
        }

        if (type === 'study') {
            typeCondition = `AND f.Kind_subscrip = N'اشتراك الدراسة السنوى'`;
        } else if (type === 'bus') {
            typeCondition = `AND f.Kind_subscrip = N'اشتراك الباص'`;
        }

        // الأقساط المتبقية فقط (PaymentDone = 0)
        const result = await request.query(`
            SELECT 
                MONTH(p.MonthPayment) as monthNum,
                YEAR(p.MonthPayment) as yearNum,
                COUNT(DISTINCT f.Child_Id) as childrenCount,
                COUNT(p.ID) as installmentsCount,
                SUM(p.amountPyment) as totalUnpaid,
                
                -- عدد المتأخر (تاريخه عدى)
                SUM(CASE 
                    WHEN p.MonthPayment < CAST(GETDATE() AS DATE) 
                    THEN 1 ELSE 0 
                END) as overdueCount,

                -- مبلغ المتأخر
                SUM(CASE 
                    WHEN p.MonthPayment < CAST(GETDATE() AS DATE) 
                    THEN p.amountPyment ELSE 0 
                END) as overdueAmount,

                -- عدد المنتظر (تاريخه لسه مجاش)
                SUM(CASE 
                    WHEN p.MonthPayment >= CAST(GETDATE() AS DATE) 
                    THEN 1 ELSE 0 
                END) as pendingCount

            FROM tbl_PaymentsChild p
            INNER JOIN tbl_FinanceChild f ON p.PaymentID = f.ID
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            WHERE f.SessionID = @sessionId
              AND p.PaymentDone = 0
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
              ${branchCondition}
              ${typeCondition}
            GROUP BY MONTH(p.MonthPayment), YEAR(p.MonthPayment)
            ORDER BY YEAR(p.MonthPayment), MONTH(p.MonthPayment)
        `);

        const months = result.recordset.map(m => ({
            ...m,
            totalUnpaid: parseFloat(m.totalUnpaid || 0),
            overdueAmount: parseFloat(m.overdueAmount || 0),
        }));

        res.status(200).json({
            success: true,
            data: months
        });

    } catch (err) {
        console.error('Calendar Error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب بيانات الكليندر',
            error: err.message
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// 7. تفاصيل أقساط شهر معين (قائمة الأطفال)
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// 7. تفاصيل أقساط شهر معين - المتبقية فقط
// ═══════════════════════════════════════════════════════════════
const getMonthDetails = async (req, res) => {
    const { sessionId, month, year } = req.params;
    const { branchId, type } = req.query;

    try {
        const request = new sql.Request();
        request.input('sessionId', sql.SmallInt, sessionId);
        request.input('month', sql.Int, month);
        request.input('year', sql.Int, year);

        let branchCondition = '';
        let typeCondition = '';

        if (branchId && branchId !== 'null') {
            request.input('branchId', sql.Int, branchId);
            branchCondition = 'AND c.Branch = @branchId';
        }

        if (type === 'study') {
            typeCondition = `AND f.Kind_subscrip = N'اشتراك الدراسة السنوى'`;
        } else if (type === 'bus') {
            typeCondition = `AND f.Kind_subscrip = N'اشتراك الباص'`;
        }

        const result = await request.query(`
            SELECT 
                p.ID as installmentId,
                p.MonthPayment,
                p.amountPyment,
                p.PaymentNotes,
                f.Child_Id,
                f.Kind_subscrip,
                c.FullNameArabic,
                c.FatherMobile1,
                c.MotherMobile1,
                b.branchName,
                
                CASE 
                    WHEN p.MonthPayment < CAST(GETDATE() AS DATE) THEN 'overdue'
                    ELSE 'pending'
                END as status,

                CASE 
                    WHEN p.MonthPayment < CAST(GETDATE() AS DATE) 
                    THEN DATEDIFF(DAY, p.MonthPayment, GETDATE())
                    ELSE 0
                END as daysLate

            FROM tbl_PaymentsChild p
            INNER JOIN tbl_FinanceChild f ON p.PaymentID = f.ID
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            WHERE f.SessionID = @sessionId
              AND p.PaymentDone = 0
              AND MONTH(p.MonthPayment) = @month
              AND YEAR(p.MonthPayment) = @year
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
              ${branchCondition}
              ${typeCondition}
            ORDER BY 
                CASE WHEN p.MonthPayment < CAST(GETDATE() AS DATE) THEN 0 ELSE 1 END,
                p.amountPyment DESC
        `);

        const summary = {
            totalChildren: new Set(result.recordset.map(r => r.Child_Id)).size,
            totalInstallments: result.recordset.length,
            totalAmount: result.recordset.reduce((sum, r) => sum + parseFloat(r.amountPyment || 0), 0),
            overdueCount: result.recordset.filter(r => r.status === 'overdue').length,
            pendingCount: result.recordset.filter(r => r.status === 'pending').length,
            overdueAmount: result.recordset.filter(r => r.status === 'overdue')
                .reduce((sum, r) => sum + parseFloat(r.amountPyment || 0), 0),
        };

        res.status(200).json({
            success: true,
            summary,
            data: result.recordset
        });

    } catch (err) {
        console.error('Month Details Error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب تفاصيل الشهر',
            error: err.message
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// 8. تفصيلة الشهر الحالي حسب الفروع
// ═══════════════════════════════════════════════════════════════
const getCurrentMonthBranches = async (req, res) => {
    const { sessionId } = req.params;
    const { type } = req.query;

    try {
        const request = new sql.Request();
        request.input('sessionId', sql.SmallInt, sessionId);

        let typeCondition = '';
        if (type === 'study') {
            typeCondition = `AND f.Kind_subscrip = N'اشتراك الدراسة السنوى'`;
        } else if (type === 'bus') {
            typeCondition = `AND f.Kind_subscrip = N'اشتراك الباص'`;
        }

        const result = await request.query(`
            SELECT 
                b.IDbranch as branchId,
                b.branchName,
                COUNT(DISTINCT f.Child_Id) as childrenCount,
                COUNT(p.ID) as installmentsCount,
                SUM(p.amountPyment) as totalUnpaid,
                
                SUM(CASE 
                    WHEN p.MonthPayment < CAST(GETDATE() AS DATE) 
                    THEN 1 ELSE 0 
                END) as overdueCount,

                SUM(CASE 
                    WHEN p.MonthPayment < CAST(GETDATE() AS DATE) 
                    THEN p.amountPyment ELSE 0 
                END) as overdueAmount,

                SUM(CASE 
                    WHEN p.MonthPayment >= CAST(GETDATE() AS DATE) 
                    THEN 1 ELSE 0 
                END) as pendingCount

            FROM tbl_PaymentsChild p
            INNER JOIN tbl_FinanceChild f ON p.PaymentID = f.ID
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            INNER JOIN tbl_Branch b ON c.Branch = b.IDbranch
            WHERE f.SessionID = @sessionId
              AND p.PaymentDone = 0
              AND MONTH(p.MonthPayment) = MONTH(GETDATE())
              AND YEAR(p.MonthPayment) = YEAR(GETDATE())
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
              ${typeCondition}
            GROUP BY b.IDbranch, b.branchName
            ORDER BY b.branchName
        `);

        res.status(200).json({
            success: true,
            currentMonth: new Date().getMonth() + 1,
            currentYear: new Date().getFullYear(),
            data: result.recordset.map(b => ({
                ...b,
                totalUnpaid: parseFloat(b.totalUnpaid || 0),
                overdueAmount: parseFloat(b.overdueAmount || 0),
            }))
        });

    } catch (err) {
        console.error('Current Month Branches Error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب بيانات الشهر الحالي',
            error: err.message
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// 9. الفحص اليومي الأوتوماتيك للأقساط (Cron Job)
// ═══════════════════════════════════════════════════════════════
const dailyInstallmentCheck = async (req, res) => {
    const { key } = req.query;
    if (key !== 'WillBee_Cron_2025_xK9mP3nQ7r') {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    try {
        let notificationsSent = 0;
        let errors = [];

        // 1️⃣ جلب المديرين والمحاسبين
        const adminsResult = await sql.query(`
            SELECT UserId FROM tbl_users 
            WHERE Role IN ('Admin', 'AccountantUser')
        `);

        if (adminsResult.recordset.length === 0) {
            return res.status(200).json({ 
                success: true, 
                message: 'لا يوجد مستخدمين لإرسال الإشعارات لهم' 
            });
        }

        // 2️⃣ كل الأقساط المتأخرة (PaymentDone = 0 وتاريخها عدى)
        const overdueResult = await sql.query(`
            SELECT 
                p.ID as installmentId,
                p.MonthPayment,
                p.amountPyment,
                f.Child_Id,
                c.FullNameArabic,
                f.Kind_subscrip,
                b.branchName,
                DATEDIFF(DAY, p.MonthPayment, CAST(${EGYPT_TIME} AS DATE)) as daysLate
            FROM tbl_PaymentsChild p
            INNER JOIN tbl_FinanceChild f ON p.PaymentID = f.ID
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            WHERE p.PaymentDone = 0
              AND p.MonthPayment < CAST(${EGYPT_TIME} AS DATE)
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
        `);

        // 3️⃣ الأقساط القادمة خلال 3 أيام
        const upcomingResult = await sql.query(`
            SELECT 
                p.ID as installmentId,
                p.MonthPayment,
                p.amountPyment,
                f.Child_Id,
                c.FullNameArabic,
                f.Kind_subscrip,
                b.branchName,
                DATEDIFF(DAY, CAST(${EGYPT_TIME} AS DATE), p.MonthPayment) as daysUntil
            FROM tbl_PaymentsChild p
            INNER JOIN tbl_FinanceChild f ON p.PaymentID = f.ID
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            WHERE p.PaymentDone = 0
              AND p.MonthPayment >= CAST(${EGYPT_TIME} AS DATE)
              AND p.MonthPayment <= DATEADD(DAY, 3, CAST(${EGYPT_TIME} AS DATE))
              AND f.Kind_subscrip IN (N'اشتراك الدراسة السنوى', N'اشتراك الباص')
        `);

        // 4️⃣ فحص آخر إشعار اتبعت لكل قسط (عشان منكررش)
        const lastNotifications = await sql.query(`
            SELECT RelatedID, MAX(CreatedAt) as lastSent
            FROM tbl_Notifications 
            WHERE NotificationType IN ('Debt', 'Reminder')
              AND RelatedTo = 'installment'
              AND RelatedID IS NOT NULL
            GROUP BY RelatedID
        `);

        // تحويل لـ Map عشان نبحث بسرعة
        const lastSentMap = {};
        for (const n of lastNotifications.recordset) {
            lastSentMap[n.RelatedID] = new Date(n.lastSent);
        }

        const now = new Date();
        const ONE_WEEK = 7 * 24 * 60 * 60 * 1000; // أسبوع بالمللي ثانية

        // 5️⃣ إرسال إشعارات المتأخرات
        for (const overdue of overdueResult.recordset) {
            const lastSent = lastSentMap[overdue.installmentId];
            
            // لو اتبعتله إشعار من أقل من أسبوع ← نتخطاه
            if (lastSent && (now - lastSent) < ONE_WEEK) {
                continue;
            }

            // تحديد مستوى الخطورة
            let urgencyEmoji = '⚠️';
            let urgencyText = '';
            if (overdue.daysLate >= 90) {
                urgencyEmoji = '🚨🚨';
                urgencyText = ' - حالة حرجة جداً';
            } else if (overdue.daysLate >= 60) {
                urgencyEmoji = '🚨';
                urgencyText = ' - حالة حرجة';
            } else if (overdue.daysLate >= 30) {
                urgencyEmoji = '❗';
                urgencyText = ' - تأخير كبير';
            } else if (overdue.daysLate >= 14) {
                urgencyEmoji = '⚠️';
                urgencyText = ' - تأخير';
            }

            const title = `${urgencyEmoji} قسط متأخر${urgencyText}`;
            const message = `${overdue.FullNameArabic} - ${overdue.branchName || ''} - ${overdue.Kind_subscrip} - مبلغ ${overdue.amountPyment} ج.م متأخر ${overdue.daysLate} يوم`;

            for (const admin of adminsResult.recordset) {
                try {
                    await createAndPushNotification(
                        admin.UserId,
                        title,
                        message,
                        'Debt',
                        'installment',
                        overdue.installmentId
                    );
                    notificationsSent++;
                } catch (err) {
                    errors.push(`Overdue failed for user ${admin.UserId}: ${err.message}`);
                }
            }
        }

        // 6️⃣ إرسال إشعارات الأقساط القادمة
        for (const upcoming of upcomingResult.recordset) {
            const lastSent = lastSentMap[upcoming.installmentId];
            
            // القادمة نبعتها مرة واحدة بس
            if (lastSent) {
                continue;
            }

            const title = '🔔 تذكير بقسط قادم';
            const daysText = upcoming.daysUntil === 0 
                ? 'مستحق اليوم' 
                : `مستحق بعد ${upcoming.daysUntil} يوم`;
            const message = `${upcoming.FullNameArabic} - ${upcoming.branchName || ''} - ${upcoming.Kind_subscrip} - مبلغ ${upcoming.amountPyment} ج.م - ${daysText}`;

            for (const admin of adminsResult.recordset) {
                try {
                    await createAndPushNotification(
                        admin.UserId,
                        title,
                        message,
                        'Reminder',
                        'installment',
                        upcoming.installmentId
                    );
                    notificationsSent++;
                } catch (err) {
                    errors.push(`Upcoming failed for user ${admin.UserId}: ${err.message}`);
                }
            }
        }

        // 7️⃣ ملخص يومي
        // نتشيك لو اتبعت ملخص النهاردة
        const todaySummary = await sql.query(`
            SELECT COUNT(*) as cnt FROM tbl_Notifications 
            WHERE CAST(CreatedAt AS DATE) = CAST(${EGYPT_TIME} AS DATE)
              AND NotificationType = 'DailySummary'
        `);

        if (todaySummary.recordset[0].cnt === 0) {
            // حساب الإجماليات
            const totalOverdueCount = overdueResult.recordset.length;
            const totalOverdueAmount = overdueResult.recordset
                .reduce((sum, o) => sum + parseFloat(o.amountPyment || 0), 0);
            const totalUpcomingCount = upcomingResult.recordset.length;
            const totalUpcomingAmount = upcomingResult.recordset
                .reduce((sum, u) => sum + parseFloat(u.amountPyment || 0), 0);

            // عدد الأطفال المتأخرين (بدون تكرار)
            const uniqueOverdueChildren = new Set(
                overdueResult.recordset.map(o => o.Child_Id)
            ).size;

            const summaryTitle = '📊 ملخص الأقساط اليومي';
            const summaryMessage = `متأخرات: ${totalOverdueCount} قسط (${uniqueOverdueChildren} طالب) بإجمالي ${totalOverdueAmount} ج.م | قادمة: ${totalUpcomingCount} قسط بإجمالي ${totalUpcomingAmount} ج.م`;

            for (const admin of adminsResult.recordset) {
                try {
                    await createAndPushNotification(
                        admin.UserId,
                        summaryTitle,
                        summaryMessage,
                        'DailySummary',
                        null,
                        null
                    );
                    notificationsSent++;
                } catch (err) {
                    errors.push(`Summary failed for ${admin.UserId}: ${err.message}`);
                }
            }
        }

        // النتيجة
        const result = {
            success: true,
            timestamp: new Date().toISOString(),
            message: 'تم الفحص اليومي بنجاح',
            stats: {
                totalOverdue: overdueResult.recordset.length,
                totalUpcoming: upcomingResult.recordset.length,
                notificationsSent: notificationsSent,
                skippedAlreadySent: overdueResult.recordset.length - 
                    (notificationsSent - (upcomingResult.recordset.length > 0 ? 1 : 0)),
                errors: errors.length
            }
        };

        console.log('📊 Daily Check:', JSON.stringify(result));
        res.status(200).json(result);

    } catch (err) {
        console.error('❌ Daily Check Error:', err);
        res.status(500).json({
            success: false,
            message: 'خطأ في الفحص اليومي',
            error: err.message
        });
    }
};

module.exports = {
    getAllDebts,
    getChildDebtDetails,
    checkOverdueInstallments,
    getFinancialKPIs,
    getAdvancedKPIs,
    getMonthlyCalendar,    
    getMonthDetails,
    getCurrentMonthBranches,
    dailyInstallmentCheck
};