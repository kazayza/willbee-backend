const { sql } = require('../config/db');

// ✅ 1. ربط طفل بعميل
const linkChildToCustomer = async (req, res) => {
    const { 
        customerId, 
        childId, 
        relationship, 
        isPrimary,
        createdBy,
        clientTime 
    } = req.body;

    if (!customerId || !childId) {
        return res.status(400).json({ message: 'customerId و childId مطلوبين' });
    }

    try {
        const request = new sql.Request();
        request.input('custId', sql.Int, customerId);
        request.input('childId', sql.Int, childId);
        request.input('relation', sql.NVarChar, relationship || 'ولي أمر');
        request.input('primary', sql.Bit, isPrimary || false);
        request.input('createdBy', sql.Int, createdBy || null);
        request.input('clientTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        // التحقق إن الربط مش موجود قبل كده
        const checkResult = await request.query(`
            SELECT ID FROM tbl_CustomerChildren 
            WHERE CustomerID = @custId AND ChildID = @childId
        `);

        if (checkResult.recordset.length > 0) {
            return res.status(400).json({ message: 'هذا الطفل مربوط بالعميل بالفعل' });
        }

        // لو isPrimary = true، نشيل الـ Primary من أي ربط تاني لنفس الطفل
        if (isPrimary) {
            await request.query(`
                UPDATE tbl_CustomerChildren 
                SET IsPrimary = 0 
                WHERE ChildID = @childId
            `);
        }

        await request.query(`
            INSERT INTO tbl_CustomerChildren 
            (CustomerID, ChildID, Relationship, IsPrimary, CreatedBy, CreatedAt)
            VALUES 
            (@custId, @childId, @relation, @primary, @createdBy, @clientTime)
        `);

        res.status(201).json({ message: 'تم ربط الطفل بالعميل بنجاح ✅' });
    } catch (err) {
        console.error('linkChildToCustomer error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 2. جلب أطفال عميل معين
const getCustomerChildren = async (req, res) => {
    const { customerId } = req.params;

    try {
        const request = new sql.Request();
        request.input('custId', sql.Int, customerId);

        const result = await request.query(`
            SELECT 
                CC.ID,
                CC.CustomerID,
                CC.ChildID,
                CC.Relationship,
                CC.IsPrimary,
                CC.CreatedAt,
                CH.FullNameArabic AS ChildName,
                CH.FullNameEnglish AS ChildNameEnglish,
                CH.birthDate,
                CH.Age,
                CH.Status AS ChildStatus,
                B.branchName AS BranchName
            FROM tbl_CustomerChildren CC
            INNER JOIN tbl_Child CH ON CC.ChildID = CH.ID_Child
            LEFT JOIN tbl_Branch B ON CH.Branch = B.IDbranch
            WHERE CC.CustomerID = @custId
            ORDER BY CC.IsPrimary DESC, CH.FullNameArabic ASC
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('getCustomerChildren error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 3. جلب أولياء أمور طفل معين
const getChildCustomers = async (req, res) => {
    const { childId } = req.params;

    try {
        const request = new sql.Request();
        request.input('childId', sql.Int, childId);

        const result = await request.query(`
            SELECT 
                CC.ID,
                CC.CustomerID,
                CC.ChildID,
                CC.Relationship,
                CC.IsPrimary,
                CC.CreatedAt,
                C.FullName AS CustomerName,
                C.Phone,
                C.Email,
                C.Status AS CustomerStatus
            FROM tbl_CustomerChildren CC
            INNER JOIN tbl_Customers C ON CC.CustomerID = C.CustomerID
            WHERE CC.ChildID = @childId AND C.IsDeleted = 0
            ORDER BY CC.IsPrimary DESC, C.FullName ASC
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('getChildCustomers error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 4. تعديل علاقة (Relationship / IsPrimary)
const updateCustomerChild = async (req, res) => {
    const { id } = req.params;
    const { relationship, isPrimary, clientTime } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('relation', sql.NVarChar, relationship);
        request.input('primary', sql.Bit, isPrimary || false);
        request.input('clientTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        // لو isPrimary = true، نشيل الـ Primary من أي ربط تاني لنفس الطفل
        if (isPrimary) {
            // أولاً نجيب الـ ChildID
            const childResult = await request.query(`
                SELECT ChildID FROM tbl_CustomerChildren WHERE ID = @id
            `);

            if (childResult.recordset.length > 0) {
                const childId = childResult.recordset[0].ChildID;
                const request2 = new sql.Request();
                request2.input('childId', sql.Int, childId);
                request2.input('id', sql.Int, id);

                await request2.query(`
                    UPDATE tbl_CustomerChildren 
                    SET IsPrimary = 0 
                    WHERE ChildID = @childId AND ID != @id
                `);
            }
        }

        const result = await request.query(`
            UPDATE tbl_CustomerChildren 
            SET Relationship = @relation,
                IsPrimary = @primary,
                UpdatedAt = @clientTime
            WHERE ID = @id
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'الربط غير موجود' });
        }

        res.status(200).json({ message: 'تم تعديل البيانات بنجاح ✅' });
    } catch (err) {
        console.error('updateCustomerChild error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 5. حذف ربط (فك ارتباط طفل من عميل)
const unlinkChildFromCustomer = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);

        const result = await request.query(`
            DELETE FROM tbl_CustomerChildren WHERE ID = @id
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'الربط غير موجود' });
        }

        res.status(200).json({ message: 'تم فك ارتباط الطفل بنجاح ✅' });
    } catch (err) {
        console.error('unlinkChildFromCustomer error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 6. البحث عن أطفال (للربط)
const searchChildren = async (req, res) => {
    const { query } = req.query;

    try {
        const request = new sql.Request();
        const searchTerm = query ? `%${query}%` : '%';
        request.input('search', sql.NVarChar, searchTerm);

        const result = await request.query(`
            SELECT TOP 20
                CH.ID_Child AS ChildID,
                CH.FullNameArabic,
                CH.FullNameEnglish,
                CH.birthDate,
                CH.Age,
                CH.Status,
                B.branchName AS BranchName
            FROM tbl_Child CH
            LEFT JOIN tbl_Branch B ON CH.Branch = B.IDbranch
            WHERE CH.FullNameArabic LIKE @search 
               OR CH.FullNameEnglish LIKE @search
            ORDER BY CH.FullNameArabic ASC
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('searchChildren error:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    linkChildToCustomer,
    getCustomerChildren,
    getChildCustomers,
    updateCustomerChild,
    unlinkChildFromCustomer,
    searchChildren
};