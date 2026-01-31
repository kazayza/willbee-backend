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
        receiptNo,       // رقم الإيصال الورقي
        notes,           // ملاحظات
        installmentId,   // ID القسط (لو بيدفع قسط) - اختياري
        userAdd,         // مين ضاف (من الموبايل)
        addTime          // توقيت مصر (من الموبايل)
    } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // 1️⃣ تسجيل رأس الإيصال في tbl_income
        const requestHead = new sql.Request(transaction);
        requestHead.input('incomeDate', sql.DateTime, addTime);
        requestHead.input('userAdd', sql.VarChar, userAdd);
        requestHead.input('addTime', sql.DateTime, addTime);
        requestHead.input('byan', sql.VarChar, notes || 'تحصيل اشتراك دراسة');

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
        requestDetail.input('kind', sql.SmallInt, kindId || 6);
        requestDetail.input('branch', sql.SmallInt, branchId);
        requestDetail.input('child', sql.Int, childId);
        requestDetail.input('receipt', sql.VarChar, receiptNo);
        requestDetail.input('notes', sql.VarChar, notes);
        requestDetail.input('datePay', sql.DateTime, addTime);

        await requestDetail.query(`
            INSERT INTO tbl_incomeDetalis 
            (IDincome, incomeAmount, incomeKind, incomBranchtxt, child_ID, ReceiptNumber, Notes, date_Pay)
            VALUES 
            (@incID, @amount, @kind, @branch, @child, @receipt, @notes, @datePay)
        `);

        // 3️⃣ تحديث القسط (لو موجود installmentId)
        if (installmentId) {
            const requestInstallment = new sql.Request(transaction);
            requestInstallment.input('instId', sql.Int, installmentId);
            requestInstallment.input('useredit', sql.VarChar, userAdd);
            requestInstallment.input('editTime', sql.DateTime, addTime);
            requestInstallment.input('notes', sql.VarChar, notes);

            await requestInstallment.query(`
                UPDATE tbl_PaymentsChild 
                SET PaymentDone = 1,
                    useredit = @useredit,
                    editTime = @editTime,
                    PaymentNotes = @notes
                WHERE ID = @instId
            `);
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

        // 3️⃣ حساب المدفوع من الأقساط
        let paidFromInstallments = 0;
        for (const inst of installmentsResult.recordset) {
            if (inst.PaymentDone) {
                paidFromInstallments += parseFloat(inst.amountPyment || 0);
            }
        }

        // 4️⃣ حساب المدفوع من الإيرادات (للدفع الكاش بدون أقساط)
        const requestPaid = new sql.Request();
        requestPaid.input('childId', sql.Int, childId);
        requestPaid.input('kindId', sql.SmallInt, 6); // اشتراك دراسة

        const paidResult = await requestPaid.query(`
            SELECT ISNULL(SUM(d.incomeAmount), 0) as totalPaid
            FROM tbl_incomeDetalis d
            INNER JOIN tbl_income i ON d.IDincome = i.ID
            WHERE d.child_ID = @childId 
              AND d.incomeKind = @kindId
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
                    remaining: remaining
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

module.exports = {
    getAllIncomes,
    getIncomeKinds,
    addIncome,
    addSubscriptionPayment,      
    getChildSubscriptionDetails
};