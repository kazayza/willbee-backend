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
                b.branchName
            FROM tbl_FinanceChild f
            LEFT JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
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

module.exports = {
    getAllDebts,
    getChildDebtDetails,
    checkOverdueInstallments
};