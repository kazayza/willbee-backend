const { sql } = require('../config/db');

// حفظ أو تعديل بيانات اشتراك (دراسة أو باص)
const setChildSubscription = async (req, res) => {
    const { 
        childId, 
        amountBase,    
        amountSub,     
        discount,      
        busLineId,     
        sessionId,     
        kindSubscription, // لازم تكون نص محدد: "اشتراك الدراسة السنوى" أو "اشتراك الباص"
        user,
        subDate           
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('child', sql.Int, childId);
        request.input('sess', sql.SmallInt, sessionId);
        request.input('kind', sql.NVarChar, kindSubscription); // ⚠️ الشرط الثالث المهم

        request.input('base', sql.Decimal(7, 2), amountBase);
        request.input('sub', sql.Decimal(7, 2), amountSub);
        request.input('disc', sql.Decimal(7, 2), discount || 0);
        request.input('bus', sql.SmallInt, busLineId); 
        request.input('user', sql.VarChar, user);
        request.input('date', sql.DateTime, subDate || new Date()); 

        // 1️⃣ البحث الثلاثي: هل للطفل سجل في هذه السنة لهذا النوع؟
        const check = await request.query(`
            SELECT ID FROM tbl_FinanceChild 
            WHERE Child_Id = @child 
              AND SessionID = @sess 
              AND Kind_subscrip = @kind
        `);

        if (check.recordset.length > 0) {
            // ✅ موجود نفس النوع في نفس السنة -> تحديث
            const recordID = check.recordset[0].ID; 
            
            await request.query(`
                UPDATE tbl_FinanceChild 
                SET amountBase = @base, 
                    amount_Sub = @sub, 
                    discount = @disc, 
                    BusLine = @bus, 
                    SubDate = @date,
                    useredit = @user,
                    editTime = GETDATE()
                WHERE ID = ${recordID}
            `);
            res.status(200).json({ message: `تم تحديث ${kindSubscription} بنجاح 🔄` });

        } else {
            // 🆕 غير موجود لهذا النوع -> إضافة جديد
            await request.query(`
                INSERT INTO tbl_FinanceChild 
                (Child_Id, SessionID, Kind_subscrip, amountBase, amount_Sub, discount, BusLine, SubDate, userAdd, Addtime, withdraw)
                VALUES 
                (@child, @sess, @kind, @base, @sub, @disc, @bus, @date, @user, GETDATE(), 0)
            `);
            res.status(201).json({ message: `تم إضافة ${kindSubscription} جديد بنجاح ✅` });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error saving finance', error: err.message });
    }
};


// 2. جلب بيانات اشتراك طفل معين (عشان نعرضها في شاشة التعديل)
const getChildSubscription = async (req, res) => {
    const { id } = req.params; // Child ID

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);

        const query = `
            SELECT 
                f.amountBase,
                f.amount_Sub,
                f.discount,
                f.BusLine,
                b.BusLine as BusLineName,
                f.SessionID,
                s.Sessions as SessionName
            FROM tbl_FinanceChild f
            LEFT JOIN tbl_BusLines b ON f.BusLine = b.ID
            LEFT JOIN tbl_Sessions s ON f.SessionID = s.IDSession
            WHERE f.Child_Id = @id
        `;

        const result = await request.query(query);

        if (result.recordset.length > 0) {
            res.status(200).json(result.recordset[0]);
        } else {
            res.status(404).json({ message: 'No subscription found for this child' });
        }

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    setChildSubscription,
    getChildSubscription
};