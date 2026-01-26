const { sql } = require('../config/db');

// 1. إضافة عميل جديد
const createCustomer = async (req, res) => {
    const { 
        fullName, 
        phone, 
        secondaryPhone,
        email, 
        address,
        childId,
        relationship,
        nextFollowUpDate,
        preferredContactMethod,
        notes,
        userAdd,
        clientTime
    } = req.body;

    try {
        const request = new sql.Request();
        
        request.input('name', sql.NVarChar, fullName);
        request.input('phone', sql.NVarChar, phone);
        request.input('secondaryPhone', sql.NVarChar, secondaryPhone || null);
        request.input('mail', sql.NVarChar, email || null);
        request.input('address', sql.NVarChar, address || null);
        request.input('child', sql.Int, childId || null);
        request.input('relationship', sql.NVarChar, relationship || null);
        request.input('nextFollowUp', sql.DateTime, nextFollowUpDate ? new Date(nextFollowUpDate) : null);
        request.input('contactMethod', sql.NVarChar, preferredContactMethod || null);
        request.input('notes', sql.NVarChar, notes || null);
        request.input('userAdd', sql.VarChar, userAdd || null);
        request.input('addTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            INSERT INTO tbl_Customers 
            (
                FullName, 
                Phone, 
                SecondaryPhone,
                Email, 
                Address,
                ChildID, 
                Relationship,
                NextFollowUpDate,
                PreferredContactMethod,
                Notes,
                CustomerType, 
                Status, 
                CreatedAt,
                userAdd,
                Addtime
            )
            OUTPUT inserted.CustomerID
            VALUES 
            (
                @name, 
                @phone, 
                @secondaryPhone,
                @mail, 
                @address,
                @child, 
                @relationship,
                @nextFollowUp,
                @contactMethod,
                @notes,
                'Parent', 
                'Active', 
                @addTime,
                @userAdd,
                @addTime
            )
        `);

        res.status(201).json({ 
            message: 'تم إضافة العميل بنجاح ✅', 
            customerId: result.recordset[0].CustomerID 
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error adding customer', error: err.message });
    }
};

// 2. جلب قائمة العملاء
const getCustomers = async (req, res) => {
    const { status } = req.query;

    try {
        const request = new sql.Request();
        
        let query = `
            SELECT 
                C.CustomerID,
                C.FullName,
                C.Phone,
                C.SecondaryPhone,
                C.Email,
                C.Address,
                C.ChildID,
                C.Relationship,
                C.NextFollowUpDate,
                C.PreferredContactMethod,
                C.Notes,
                C.Status,
                C.CustomerType,
                C.CreatedAt,
                C.userAdd,
                C.Addtime,
                CH.FullNameArabic AS ChildName
            FROM tbl_Customers C
            LEFT JOIN tbl_Child CH ON C.ChildID = CH.ID_Child
            WHERE C.IsDeleted = 0
        `;

        if (status) {
            request.input('stat', sql.NVarChar, status);
            query += ' AND C.Status = @stat';
        }

        query += ' ORDER BY C.CreatedAt DESC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);
        
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. تعديل بيانات عميل
const updateCustomer = async (req, res) => {
    const { id } = req.params;
    const { 
        fullName, 
        phone, 
        secondaryPhone,
        email, 
        address,
        childId,
        relationship,
        nextFollowUpDate,
        preferredContactMethod,
        notes,
        status,
        useredit,
        clientTime
    } = req.body;

    try {
        const request = new sql.Request();
        
        request.input('id', sql.Int, id);
        request.input('name', sql.NVarChar, fullName);
        request.input('phone', sql.NVarChar, phone);
        request.input('secondaryPhone', sql.NVarChar, secondaryPhone || null);
        request.input('mail', sql.NVarChar, email || null);
        request.input('address', sql.NVarChar, address || null);
        request.input('child', sql.Int, childId || null);
        request.input('relationship', sql.NVarChar, relationship || null);
        request.input('nextFollowUp', sql.DateTime, nextFollowUpDate ? new Date(nextFollowUpDate) : null);
        request.input('contactMethod', sql.NVarChar, preferredContactMethod || null);
        request.input('notes', sql.NVarChar, notes || null);
        request.input('status', sql.NVarChar, status || 'Active');
        request.input('useredit', sql.VarChar, useredit || null);
        request.input('editTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            UPDATE tbl_Customers 
            SET FullName = @name,
                Phone = @phone,
                SecondaryPhone = @secondaryPhone,
                Email = @mail,
                Address = @address,
                ChildID = @child,
                Relationship = @relationship,
                NextFollowUpDate = @nextFollowUp,
                PreferredContactMethod = @contactMethod,
                Notes = @notes,
                Status = @status,
                UpdatedAt = @editTime,
                useredit = @useredit,
                editTime = @editTime
            WHERE CustomerID = @id AND IsDeleted = 0
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'العميل غير موجود' });
        }

        res.status(200).json({ message: 'تم تعديل بيانات العميل بنجاح ✅' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error updating customer', error: err.message });
    }
};

// 4. حذف عميل (Soft Delete)
const deleteCustomer = async (req, res) => {
    const { id } = req.params;
    const { useredit, clientTime } = req.body;

    try {
        const request = new sql.Request();
        
        request.input('id', sql.Int, id);
        request.input('useredit', sql.VarChar, useredit || null);
        request.input('editTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            UPDATE tbl_Customers 
            SET IsDeleted = 1,
                UpdatedAt = @editTime,
                useredit = @useredit,
                editTime = @editTime
            WHERE CustomerID = @id
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'العميل غير موجود' });
        }

        res.status(200).json({ message: 'تم حذف العميل بنجاح ✅' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error deleting customer', error: err.message });
    }
};

// 5. جلب عميل واحد بالتفاصيل
const getCustomerById = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);

        const result = await request.query(`
            SELECT 
                C.*,
                CH.FullNameArabic AS ChildName,
                CH.FullNameEnglish AS ChildNameEnglish,
                CH.birthDate AS ChildBirthDate,
                CH.Age AS ChildAge
            FROM tbl_Customers C
            LEFT JOIN tbl_Child CH ON C.ChildID = CH.ID_Child
            WHERE C.CustomerID = @id AND C.IsDeleted = 0
        `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'العميل غير موجود' });
        }

        res.status(200).json(result.recordset[0]);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. جلب العملاء اللي محتاجين متابعة
const getCustomersNeedFollowUp = async (req, res) => {
    try {
        const request = new sql.Request();

        const result = await request.query(`
            SELECT 
                C.CustomerID,
                C.FullName,
                C.Phone,
                C.NextFollowUpDate,
                C.PreferredContactMethod,
                C.Notes,
                CH.FullNameArabic AS ChildName
            FROM tbl_Customers C
            LEFT JOIN tbl_Child CH ON C.ChildID = CH.ID_Child
            WHERE C.IsDeleted = 0 
              AND C.NextFollowUpDate IS NOT NULL
              AND C.NextFollowUpDate <= GETDATE()
            ORDER BY C.NextFollowUpDate ASC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { 
    createCustomer,
    getCustomers,
    updateCustomer,
    deleteCustomer,
    getCustomerById,
    getCustomersNeedFollowUp
};