const { sql } = require('../config/db');

// 1. عرض الإيرادات (مع اسم الطفل والفرع والنوع)
const getAllIncomes = async (req, res) => {
    try {
        const query = `
            SELECT 
                i.ID, 
                i.incomeDate, 
                c.FullNameArabic as ChildName, -- اسم الطفل
                k.incomeKind as KindName,      -- نوع الإيراد
                b.branchName,                  -- الفرع
                d.incomeAmount, 
                d.ReceiptNumber,               -- رقم الإيصال الورقي
                d.Notes,
                i.userAdd
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            LEFT JOIN tbl_Child c ON d.child_ID = c.ID_Child
            LEFT JOIN tbl_incomeKind k ON d.incomeKind = k.ID
            LEFT JOIN tbl_Branch b ON d.incomBranchtxt = b.IDbranch
            ORDER BY i.incomeDate DESC
        `;
        const result = await sql.query(query);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في جلب الإيرادات', error: err.message });
    }
};

// جلب أنواع الإيرادات (مع المجموعة بتاعتها)
const getIncomeKinds = async (req, res) => {
    try {
        // ضيفنا kindGroup هنا 👇
        const result = await sql.query('SELECT ID, incomeKind, kindGroup FROM tbl_incomeKind ORDER BY kindGroup, incomeKind');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching kinds', error: err.message });
    }
};

// 3. إضافة إيصال جديد (تحصيل) 💰
const addIncome = async (req, res) => {
    const { 
        amount, 
        notes, 
        date, 
        user, 
        kindId,   // نوع الإيراد
        branchId, // الفرع
        childId,  // الطفل (مهم جداً)
        receiptNo // رقم الإيصال الورقي (اختياري)
    } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 1️⃣ تسجيل رأس الإيصال
        const requestHead = new sql.Request(transaction);
        requestHead.input('date', sql.DateTime, date || new Date());
        requestHead.input('user', sql.VarChar, user || 'AppUser');
        requestHead.input('byan', sql.VarChar, notes || 'تحصيل نقدية');

        const headResult = await requestHead.query(`
            INSERT INTO tbl_income (incomeDate, incomeByan, userAdd, Addtime, IncomeDone)
            OUTPUT inserted.ID
            VALUES (@date, @byan, @user, GETDATE(), 1)
        `);

        const newIncomeID = headResult.recordset[0].ID;

        // 2️⃣ تسجيل التفاصيل (وربطها بالطفل)
        const requestDetail = new sql.Request(transaction);
        requestDetail.input('incID', sql.Int, newIncomeID);
        requestDetail.input('amount', sql.Decimal(10, 2), amount);
        requestDetail.input('kind', sql.SmallInt, kindId);
        requestDetail.input('branch', sql.SmallInt, branchId);
        requestDetail.input('child', sql.Int, childId); // هنا الربط بالطفل
        requestDetail.input('receipt', sql.VarChar, receiptNo);
        requestDetail.input('notes', sql.VarChar, notes);

        await requestDetail.query(`
            INSERT INTO tbl_incomeDetalis 
            (IDincome, incomeAmount, incomeKind, incomBranchtxt, child_ID, ReceiptNumber, Notes)
            VALUES 
            (@incID, @amount, @kind, @branch, @child, @receipt, @notes)
        `);

        await transaction.commit();
        res.status(201).json({ message: 'تم تحصيل المبلغ بنجاح ✅', id: newIncomeID });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'فشلت عملية التحصيل', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 4. تحصيل اشتراك دراسة (مع تحديث القسط لو موجود)
// ═══════════════════════════════════════════════════════════════
const addSubscriptionPayment = async (req, res) => {
    const { 
        amount,          // المبلغ المدفوع
        childId,         // الطفل
        branchId,        // الفرع
        kindId,          // نوع الإيراد (6 = اشتراك دراسة)
        sessionId,       // العام المالي ⭐ مهم جداً
        receiptNo,       // رقم الإيصال الورقي
        notes,           // ملاحظات
        installmentId,   // ID القسط (لو بيدفع قسط) - اختياري
        userAdd,         // مين ضاف (من الموبايل)
        addTime,         // توقيت الإضافة (من الموبايل)
        payDate          // تاريخ الدفع (من الموبايل)
    } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 1️⃣ تسجيل رأس الإيصال في tbl_income
        const requestHead = new sql.Request(transaction);
        requestHead.input('incomeDate', sql.Date, payDate);
        requestHead.input('userAdd', sql.VarChar, userAdd);
        requestHead.input('addTime', sql.DateTime, addTime);
        requestHead.input('byan', sql.VarChar, notes || 'تحصيل اشتراك دراسة');

        const headResult = await requestHead.query(`
            INSERT INTO tbl_income (incomeDate, incomeByan, userAdd, Addtime, IncomeDone)
            OUTPUT inserted.ID
            VALUES (@incomeDate, @byan, @userAdd, @addTime, 1)
        `);

        const newIncomeID = headResult.recordset[0].ID;

        // 2️⃣ تسجيل التفاصيل في tbl_incomeDetalis (مع incomeSessiontxt)
        const requestDetail = new sql.Request(transaction);
        requestDetail.input('incID', sql.Int, newIncomeID);
        requestDetail.input('amount', sql.Decimal(10, 2), amount);
        requestDetail.input('kind', sql.SmallInt, kindId || 6);
        requestDetail.input('branch', sql.SmallInt, branchId);
        requestDetail.input('child', sql.Int, childId);
        requestDetail.input('session', sql.SmallInt, sessionId);  // ⭐ العام المالي
        requestDetail.input('receipt', sql.VarChar, receiptNo);
        requestDetail.input('notes', sql.VarChar, notes);
        requestDetail.input('datePay', sql.Date, payDate );

        await requestDetail.query(`
            INSERT INTO tbl_incomeDetalis 
            (IDincome, incomeAmount, incomeKind, incomBranchtxt, child_ID, incomeSessiontxt, ReceiptNumber, Notes, date_Pay)
            VALUES 
            (@incID, @amount, @kind, @branch, @child, @session, @receipt, @notes, @datePay)
        `);

        // 3️⃣ تحديث القسط (لو موجود installmentId)
        if (installmentId) {
            // أولاً: نجيب بيانات القسط
            const requestGetInst = new sql.Request(transaction);
            requestGetInst.input('instId', sql.Int, installmentId);
            
            const instResult = await requestGetInst.query(`
                SELECT PaymentID, amountPyment FROM tbl_PaymentsChild WHERE ID = @instId
            `);

            if (instResult.recordset.length > 0) {
                const installment = instResult.recordset[0];
                const installmentAmount = parseFloat(installment.amountPyment || 0);
                const financeId = installment.PaymentID;

                // نحسب إجمالي المدفوع للطفل في العام المالي ده
                const requestTotalPaid = new sql.Request(transaction);
                requestTotalPaid.input('childId', sql.Int, childId);
                requestTotalPaid.input('kindId', sql.SmallInt, kindId || 6);
                requestTotalPaid.input('sessionId', sql.SmallInt, sessionId);  // ⭐ فلترة بالعام

                const totalPaidResult = await requestTotalPaid.query(`
                    SELECT ISNULL(SUM(incomeAmount), 0) as totalPaid
                    FROM tbl_incomeDetalis
                    WHERE child_ID = @childId 
                      AND incomeKind = @kindId
                      AND incomeSessiontxt = @sessionId
                `);

                const totalPaid = parseFloat(totalPaidResult.recordset[0].totalPaid || 0);

                // نحسب إجمالي الأقساط المطلوبة لحد القسط الحالي (مرتبة بالتاريخ)
                const requestInstTotal = new sql.Request(transaction);
                requestInstTotal.input('financeId', sql.Int, financeId);
                requestInstTotal.input('instId', sql.Int, installmentId);

                const instTotalResult = await requestInstTotal.query(`
                    SELECT ISNULL(SUM(amountPyment), 0) as totalRequired
                    FROM tbl_PaymentsChild 
                    WHERE PaymentID = @financeId 
                      AND ID <= @instId
                      AND PaymentDone = 0
                `);

                const totalRequired = parseFloat(instTotalResult.recordset[0].totalRequired || 0);

                // لو المدفوع >= مبلغ القسط المحدد، نعلم عليه مدفوع
                if (totalPaid >= installmentAmount) {
                    const requestUpdateInst = new sql.Request(transaction);
                    requestUpdateInst.input('instId', sql.Int, installmentId);
                    requestUpdateInst.input('useredit', sql.VarChar, userAdd);
                    requestUpdateInst.input('editTime', sql.DateTime, addTime);
                    requestUpdateInst.input('notes', sql.VarChar, notes);

                    await requestUpdateInst.query(`
                        UPDATE tbl_PaymentsChild 
                        SET PaymentDone = 1,
                            useredit = @useredit,
                            editTime = @editTime,
                            PaymentNotes = @notes
                        WHERE ID = @instId
                    `);
                }
            }
        }

        await transaction.commit();
        res.status(201).json({ 
            success: true,
            message: 'تم تحصيل المبلغ بنجاح ✅', 
            id: newIncomeID 
        });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ 
            success: false,
            message: 'فشلت عملية التحصيل', 
            error: err.message 
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// 5. جلب بيانات اشتراك طفل مع الأقساط والمدفوعات
// ═══════════════════════════════════════════════════════════════
const getChildSubscriptionDetails = async (req, res) => {
    const { childId, sessionId } = req.params;

    try {
        const request = new sql.Request();
        request.input('childId', sql.Int, childId);
        request.input('sessionId', sql.SmallInt, sessionId);

        // 1️⃣ بيانات الاشتراك من tbl_FinanceChild
        const financeResult = await request.query(`
            SELECT 
                f.ID as financeId,
                f.Child_Id,
                f.Kind_subscrip,
                f.amountBase,
                f.discount,
                f.amount_Sub,
                f.SessionID,
                s.Sessions as SessionName,
                c.FullNameArabic as ChildName,
                c.Branch
            FROM tbl_FinanceChild f
            LEFT JOIN tbl_Sessions s ON f.SessionID = s.IDSession
            LEFT JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            WHERE f.Child_Id = @childId 
              AND f.SessionID = @sessionId
              AND f.Kind_subscrip = N'اشتراك الدراسة السنوى'
        `);

        if (financeResult.recordset.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'لا يوجد اشتراك لهذا الطفل في هذا العام' 
            });
        }

        const finance = financeResult.recordset[0];

        // 2️⃣ الأقساط من tbl_PaymentsChild
        const requestInstallments = new sql.Request();
        requestInstallments.input('financeId', sql.Int, finance.financeId);

        const installmentsResult = await requestInstallments.query(`
            SELECT 
                ID,
                PaymentID,
                MonthPayment,
                amountPyment,
                PaymentDone,
                PaymentNotes
            FROM tbl_PaymentsChild 
            WHERE PaymentID = @financeId
            ORDER BY MonthPayment ASC
        `);

        // 3️⃣ حساب المدفوع من tbl_incomeDetalis (مرتبط بالعام المالي) ⭐
        const requestPaid = new sql.Request();
        requestPaid.input('childId', sql.Int, childId);
        requestPaid.input('kindId', sql.SmallInt, 6);
        requestPaid.input('sessionId', sql.SmallInt, sessionId);  // ⭐ فلترة بالعام

        const paidResult = await requestPaid.query(`
            SELECT ISNULL(SUM(d.incomeAmount), 0) as totalPaid
            FROM tbl_incomeDetalis d
            WHERE d.child_ID = @childId 
              AND d.incomeKind = @kindId
              AND d.incomeSessiontxt = @sessionId
        `);

        const totalPaid = parseFloat(paidResult.recordset[0].totalPaid || 0);
        const totalAmount = parseFloat(finance.amount_Sub || 0);
        const remaining = totalAmount - totalPaid;

        res.status(200).json({
            success: true,
            data: {
                finance: finance,
                installments: installmentsResult.recordset,
                summary: {
                    totalAmount: totalAmount,
                    totalPaid: totalPaid,
                    remaining: remaining > 0 ? remaining : 0
                }
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ 
            success: false,
            message: 'خطأ في جلب البيانات', 
            error: err.message 
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// 6. تحصيل إيراد عام (كورسات، أنشطة، مبيعات)
// ═══════════════════════════════════════════════════════════════
const addGeneralIncome = async (req, res) => {
    const { 
        amount,
        childId,
        branchId,
        kindId,
        sessionId,
        receiptNo,
        notes,
        userAdd,
        addTime,
        payDate
    } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 1️⃣ تسجيل رأس الإيصال في tbl_income
        const requestHead = new sql.Request(transaction);
        requestHead.input('incomeDate', sql.Date, payDate);
        requestHead.input('userAdd', sql.VarChar, userAdd);
        requestHead.input('addTime', sql.DateTime, addTime);
        requestHead.input('byan', sql.VarChar, notes || 'تحصيل إيراد');

        const headResult = await requestHead.query(`
            INSERT INTO tbl_income (incomeDate, incomeByan, userAdd, Addtime, IncomeDone)
            OUTPUT inserted.ID
            VALUES (@incomeDate, @byan, @userAdd, @addTime, 1)
        `);

        const newIncomeID = headResult.recordset[0].ID;

        // 2️⃣ تسجيل التفاصيل في tbl_incomeDetalis
        const requestDetail = new sql.Request(transaction);
        requestDetail.input('incID', sql.Int, newIncomeID);
        requestDetail.input('amount', sql.Decimal(10, 2), amount);
        requestDetail.input('kind', sql.SmallInt, kindId);
        requestDetail.input('branch', sql.SmallInt, branchId);
        requestDetail.input('child', sql.Int, childId);
        requestDetail.input('session', sql.SmallInt, sessionId);
        requestDetail.input('receipt', sql.VarChar, receiptNo);
        requestDetail.input('notes', sql.VarChar, notes);
        requestDetail.input('datePay', sql.Date, payDate);

        await requestDetail.query(`
            INSERT INTO tbl_incomeDetalis 
            (IDincome, incomeAmount, incomeKind, incomBranchtxt, child_ID, incomeSessiontxt, ReceiptNumber, Notes, date_Pay)
            VALUES 
            (@incID, @amount, @kind, @branch, @child, @session, @receipt, @notes, @datePay)
        `);

        await transaction.commit();
        res.status(201).json({ 
            success: true,
            message: 'تم تحصيل المبلغ بنجاح ✅', 
            id: newIncomeID 
        });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ 
            success: false,
            message: 'فشلت عملية التحصيل', 
            error: err.message 
        });
    }
};

// ═══════════════════════════════════════════════════════════════
// 7. جلب إيراد واحد بالـ ID
// ═══════════════════════════════════════════════════════════════
const getIncomeById = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);

        const result = await request.query(`
            SELECT 
                i.ID, 
                i.incomeDate, 
                i.incomeByan,
                i.userAdd,
                i.Addtime,
                i.useredit,
                i.editTime,
                c.ID_Child,
                c.FullNameArabic as ChildName,
                k.ID as KindId,
                k.incomeKind as KindName,
                k.kindGroup,
                b.IDbranch as BranchId,
                b.branchName,
                d.ID as DetailId,
                d.incomeAmount, 
                d.ReceiptNumber,
                d.Notes,
                d.date_Pay,
                d.incomeSessiontxt,
                s.Sessions as SessionName
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            LEFT JOIN tbl_Child c ON d.child_ID = c.ID_Child
            LEFT JOIN tbl_incomeKind k ON d.incomeKind = k.ID
            LEFT JOIN tbl_Branch b ON d.incomBranchtxt = b.IDbranch
            LEFT JOIN tbl_Sessions s ON d.incomeSessiontxt = s.IDSession
            WHERE i.ID = @id
        `);

        if (result.recordset.length > 0) {
            res.status(200).json({ success: true, data: result.recordset[0] });
        } else {
            res.status(404).json({ success: false, message: 'الإيراد غير موجود' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'خطأ في جلب البيانات', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 8. تعديل إيراد
// ═══════════════════════════════════════════════════════════════
const updateIncome = async (req, res) => {
    const { id } = req.params;
    const {
        amount,
        childId,
        branchId,
        kindId,
        sessionId,
        receiptNo,
        notes,
        payDate,
        useredit,
        editTime
    } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 1️⃣ تحديث رأس الإيصال
        const requestHead = new sql.Request(transaction);
        requestHead.input('id', sql.Int, id);
        requestHead.input('incomeDate', sql.Date, payDate);
        requestHead.input('byan', sql.VarChar, notes);
        requestHead.input('useredit', sql.VarChar, useredit);
        requestHead.input('editTime', sql.DateTime, editTime);

        await requestHead.query(`
            UPDATE tbl_income 
            SET incomeDate = @incomeDate,
                incomeByan = @byan,
                useredit = @useredit,
                editTime = @editTime
            WHERE ID = @id
        `);

        // 2️⃣ تحديث التفاصيل
        const requestDetail = new sql.Request(transaction);
        requestDetail.input('incId', sql.Int, id);
        requestDetail.input('amount', sql.Decimal(10, 2), amount);
        requestDetail.input('kind', sql.SmallInt, kindId);
        requestDetail.input('branch', sql.SmallInt, branchId);
        requestDetail.input('child', sql.Int, childId);
        requestDetail.input('session', sql.SmallInt, sessionId);
        requestDetail.input('receipt', sql.VarChar, receiptNo);
        requestDetail.input('notes', sql.VarChar, notes);
        requestDetail.input('datePay', sql.Date, payDate);

        await requestDetail.query(`
            UPDATE tbl_incomeDetalis 
            SET incomeAmount = @amount,
                incomeKind = @kind,
                incomBranchtxt = @branch,
                child_ID = @child,
                incomeSessiontxt = @session,
                ReceiptNumber = @receipt,
                Notes = @notes,
                date_Pay = @datePay
            WHERE IDincome = @incId
        `);

        await transaction.commit();
        res.status(200).json({ success: true, message: 'تم تعديل الإيراد بنجاح ✅' });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'فشل تعديل الإيراد', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 9. حذف إيراد
// ═══════════════════════════════════════════════════════════════
const deleteIncome = async (req, res) => {
    const { id } = req.params;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 1️⃣ حذف التفاصيل أولاً
        const requestDetail = new sql.Request(transaction);
        requestDetail.input('id', sql.Int, id);
        await requestDetail.query('DELETE FROM tbl_incomeDetalis WHERE IDincome = @id');

        // 2️⃣ حذف رأس الإيصال
        const requestHead = new sql.Request(transaction);
        requestHead.input('id', sql.Int, id);
        const result = await requestHead.query('DELETE FROM tbl_income WHERE ID = @id');

        await transaction.commit();

        if (result.rowsAffected[0] > 0) {
            res.status(200).json({ success: true, message: 'تم حذف الإيراد بنجاح 🗑️' });
        } else {
            res.status(404).json({ success: false, message: 'الإيراد غير موجود' });
        }

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: 'فشل حذف الإيراد', error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════
// 10. فلترة الإيرادات - معدّل ✅
// ═══════════════════════════════════════════════════════════════
const filterIncomes = async (req, res) => {
    const { sessionId, branchId, kindId, childId, fromDate, toDate } = req.query;

    try {
        let query = `
            SELECT 
                i.ID, 
                i.incomeDate, 
                d.child_ID as ID_Child,
                c.FullNameArabic as ChildName,
                d.incomeKind as KindId,
                k.incomeKind as KindName,
                k.kindGroup,
                d.incomBranchtxt as BranchId,
                b.branchName,
                d.incomeSessiontxt,
                d.incomeAmount, 
                d.ReceiptNumber,
                d.Notes,
                d.date_Pay,
                s.Sessions as SessionName,
                i.userAdd,
                i.Addtime,
                i.useredit,
                i.editTime
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            LEFT JOIN tbl_Child c ON d.child_ID = c.ID_Child
            LEFT JOIN tbl_incomeKind k ON d.incomeKind = k.ID
            LEFT JOIN tbl_Branch b ON d.incomBranchtxt = b.IDbranch
            LEFT JOIN tbl_Sessions s ON d.incomeSessiontxt = s.IDSession
            WHERE 1=1
        `;

        const request = new sql.Request();

        if (sessionId) {
            query += ' AND d.incomeSessiontxt = @sessionId';
            request.input('sessionId', sql.SmallInt, sessionId);
        }
        if (branchId) {
            query += ' AND d.incomBranchtxt = @branchId';
            request.input('branchId', sql.SmallInt, branchId);
        }
        if (kindId) {
            query += ' AND d.incomeKind = @kindId';
            request.input('kindId', sql.SmallInt, kindId);
        }
        if (childId) {
            query += ' AND d.child_ID = @childId';
            request.input('childId', sql.Int, childId);
        }
        if (fromDate) {
            query += ' AND i.incomeDate >= @fromDate';
            request.input('fromDate', sql.Date, fromDate);
        }
        if (toDate) {
            query += ' AND i.incomeDate <= @toDate';
            request.input('toDate', sql.Date, toDate);
        }

        query += ' ORDER BY i.incomeDate DESC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'خطأ في جلب الإيرادات', error: err.message });
    }
};

module.exports = {
    getAllIncomes,
    getIncomeKinds,
    addIncome,
    addSubscriptionPayment,      
    getChildSubscriptionDetails,
    addGeneralIncome,
    getIncomeById,
    updateIncome,
    deleteIncome,
    filterIncomes
};