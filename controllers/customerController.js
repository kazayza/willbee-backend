const { sql } = require('../config/db');

// إضافة عميل جديد
const createCustomer = async (req, res) => {
    const { fullName, phone, email, childId } = req.body; // childId لو ولي أمر لطفل موجود

    try {
        const request = new sql.Request();
        request.input('name', sql.NVarChar, fullName);
        request.input('phone', sql.NVarChar, phone);
        request.input('mail', sql.NVarChar, email);
        request.input('child', sql.Int, childId); // ممكن null

        // إضافة العميل وإرجاع الـ ID بتاعه
        const result = await request.query(`
            INSERT INTO tbl_Customers 
            (FullName, Phone, Email, ChildID, CustomerType, Status, CreatedAt)
            OUTPUT inserted.CustomerID
            VALUES 
            (@name, @phone, @mail, @child, 'Parent', 'Active', GETDATE())
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

module.exports = { createCustomer };