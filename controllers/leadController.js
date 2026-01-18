const { sql } = require('../config/db');

// 1. تسجيل عميل محتمل جديد (Lead)
const createLead = async (req, res) => {
    const { 
        fullName, 
        phone, 
        source, // مصدر المعرفة (Facebook, Friend...)
        interestedProgram, // مهتم بإيه (Baby Class, KG1...)
        notes 
    } = req.body;

    try {
        const request = new sql.Request();
        request.input('name', sql.NVarChar, fullName);
        request.input('phone', sql.NVarChar, phone);
        request.input('src', sql.NVarChar, source || 'Direct');
        request.input('prog', sql.NVarChar, interestedProgram);
        request.input('notes', sql.NVarChar, notes);

        await request.query(`
            INSERT INTO tbl_Leads 
            (FullName, Phone, LeadSource, InterestedProgram, Notes, Status, CreatedAt, ContactDate)
            VALUES 
            (@name, @phone, @src, @prog, @notes, 'New', GETDATE(), GETDATE())
        `);

        res.status(201).json({ message: 'تم تسجيل العميل المحتمل بنجاح 🎯' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error creating lead', error: err.message });
    }
};

// 2. عرض الـ Leads (مع الفلترة بالحالة)
const getLeads = async (req, res) => {
    const { status } = req.query; // New, Contacted, Converted

    try {
        const request = new sql.Request();
        let query = 'SELECT * FROM tbl_Leads WHERE IsDeleted = 0';

        if (status) {
            request.input('stat', sql.NVarChar, status);
            query += ' AND Status = @stat';
        }

        query += ' ORDER BY CreatedAt DESC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. تحويل Lead إلى Customer (أهم دالة) 🌟
// 3. تحويل Lead إلى Customer
const convertLeadToCustomer = async (req, res) => {
    const { leadId } = req.params;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        // أ) نجيب بيانات الـ Lead الأول (بـ Parameterized Query)
        const leadRequest = new sql.Request(transaction);
        leadRequest.input('id', sql.Int, leadId);

        const leadData = await leadRequest.query(`
            SELECT * 
            FROM tbl_Leads 
            WHERE LeadID = @id AND IsDeleted = 0
        `);
        
        if (leadData.recordset.length === 0) {
            throw new Error('Lead not found');
        }

        const lead = leadData.recordset[0];

        // ب) نضيفه في جدول العملاء
        const custRequest = new sql.Request(transaction);
        custRequest.input('name', sql.NVarChar, lead.FullName);
        custRequest.input('phone', sql.NVarChar, lead.Phone);

        const custResult = await custRequest.query(`
            INSERT INTO tbl_Customers 
            (FullName, Phone, Status, CustomerType, CreatedAt)
            OUTPUT inserted.CustomerID
            VALUES (@name, @phone, 'Active', 'Parent', GETDATE())
        `);

        const newCustID = custResult.recordset[0].CustomerID;

        // ج) نحدث حالة الـ Lead إنه بقى Converted
        const updateRequest = new sql.Request(transaction);
        updateRequest.input('lid', sql.Int, leadId);
        updateRequest.input('cid', sql.Int, newCustID);

        await updateRequest.query(`
            UPDATE tbl_Leads 
            SET Status = 'Converted', 
                ConvertedToCustomerID = @cid, 
                ConversionDate = GETDATE(),
                UpdatedAt = GETDATE()
            WHERE LeadID = @lid
        `);

        await transaction.commit();
        res.status(200).json({ 
            message: 'تم تحويل العميل بنجاح! 🎉', 
            newCustomerId: newCustID 
        });

    } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).json({ message: 'فشل التحويل', error: err.message });
    }
};

module.exports = {
    createLead,
    getLeads,
    convertLeadToCustomer
};