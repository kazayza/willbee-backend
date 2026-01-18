const { sql } = require('../config/db');

// 1. تسجيل عميل محتمل جديد (Lead) - النسخة الكاملة
const createLead = async (req, res) => {
    const { 
        fullName,          // اسم ولي الأمر
        phone,             // الموبايل
        email,             // إيميل ولي الأمر (اختياري)
        childAge,          // سن الطفل (رقم)
        source,            // مصدر المعرفة (Facebook, Friend...)
        interestedProgram, // البرنامج المهتم به
        branchId,          // الفرع المفضّل (ID من tbl_Branch)
        nextFollowUp,      // ميعاد المتابعة الجاية (تاريخ/وقت)
        notes              // ملاحظات إضافية
    } = req.body;

    try {
        const request = new sql.Request();

        //  بيانات أساسية
        request.input('name',   sql.NVarChar, fullName);
        request.input('phone',  sql.NVarChar, phone);
        
        // اختياري
        request.input('mail',   sql.NVarChar, email || null);
        request.input('age',    sql.Int,      childAge || null);

        // مصدر المعرفة (لو فاضي نخليه Direct)
        request.input('src',    sql.NVarChar, (source && source.trim()) ? source : 'Direct');

        // البرنامج المهتم به (اختياري)
        request.input('prog',   sql.NVarChar, interestedProgram || null);

        // الفرع المفضّل (اختياري)
        request.input('branch', sql.SmallInt, branchId || null);

        // ميعاد المتابعة الجاية (اختياري)
        const nextDate = nextFollowUp ? new Date(nextFollowUp) : null;
        request.input('next',   sql.DateTime, nextDate);

        // ملاحظات (اختيارية)
        request.input('notes',  sql.NVarChar, notes || null);

        await request.query(`
            INSERT INTO tbl_Leads 
            (
                FullName,
                Phone,
                Email,
                ChildAge,
                LeadSource,
                InterestedProgram,
                BranchPreference,
                ContactDate,
                Status,
                Notes,
                NextFollowUp,
                CreatedAt
            )
            VALUES 
            (
                @name,
                @phone,
                @mail,
                @age,
                @src,
                @prog,
                @branch,
                GETDATE(),   -- ContactDate
                'New',       -- Status
                @notes,
                @next,
                GETDATE()    -- CreatedAt
            )
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