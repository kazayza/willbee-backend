const { sql } = require('../config/db');

// 1. تسجيل عميل محتمل جديد (Lead)
const createLead = async (req, res) => {
    const { 
        fullName,
        phone,
        email,
        childAge,
        source,
        sourceId,
        interestedProgram,
        branchId,
        assignedTo,
        nextFollowUp,
        notes,
        userAdd,
        clientTime
    } = req.body;

    try {
        const request = new sql.Request();

        request.input('name', sql.NVarChar, fullName);
        request.input('phone', sql.NVarChar, phone);
        request.input('mail', sql.NVarChar, email || null);
        request.input('age', sql.Int, childAge || null);
        request.input('src', sql.NVarChar, (source && source.trim()) ? source : 'Direct');
        request.input('sourceId', sql.Int, sourceId || null);
        request.input('prog', sql.NVarChar, interestedProgram || null);
        request.input('branch', sql.SmallInt, branchId || null);
        request.input('assignedTo', sql.Int, assignedTo || null);
        
        const nextDate = nextFollowUp ? new Date(nextFollowUp) : null;
        request.input('next', sql.DateTime, nextDate);
        
        request.input('notes', sql.NVarChar, notes || null);
        request.input('userAdd', sql.VarChar, userAdd || null);
        request.input('addTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            INSERT INTO tbl_Leads 
            (
                FullName,
                Phone,
                Email,
                ChildAge,
                LeadSource,
                SourceID,
                InterestedProgram,
                BranchPreference,
                AssignedTo,
                ContactDate,
                Status,
                Notes,
                NextFollowUp,
                CreatedAt,
                userAdd,
                AddTime
            )
            OUTPUT INSERTED.LeadID
            VALUES 
            (
                @name,
                @phone,
                @mail,
                @age,
                @src,
                @sourceId,
                @prog,
                @branch,
                @assignedTo,
                @addTime,
                'New',
                @notes,
                @next,
                @addTime,
                @userAdd,
                @addTime
            )
        `);

        res.status(201).json({ 
            message: 'تم تسجيل العميل المحتمل بنجاح 🎯',
            leadId: result.recordset[0].LeadID
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error creating lead', error: err.message });
    }
};

// 2. عرض الـ Leads (مع الفلترة بالحالة)
const getLeads = async (req, res) => {
    const { status, sourceId, assignedTo, branchId } = req.query;

    try {
        const request = new sql.Request();

        let query = `
            SELECT 
                L.*,
                B.branchName AS BranchName,
                S.SourceName AS SourceName,
                E.empName AS AssignedToName
            FROM tbl_Leads L
            LEFT JOIN tbl_Branch B ON L.BranchPreference = B.IDbranch
            LEFT JOIN tbl_LeadSources S ON L.SourceID = S.SourceID
            LEFT JOIN tbl_empolyee E ON L.AssignedTo = E.ID
            WHERE L.IsDeleted = 0
        `;

        if (status) {
            request.input('stat', sql.NVarChar, status);
            query += ' AND L.Status = @stat';
        }

        if (sourceId) {
            request.input('srcId', sql.Int, sourceId);
            query += ' AND L.SourceID = @srcId';
        }

        if (assignedTo) {
            request.input('empId', sql.Int, assignedTo);
            query += ' AND L.AssignedTo = @empId';
        }

        if (branchId) {
            request.input('branchId', sql.SmallInt, branchId);
            query += ' AND L.BranchPreference = @branchId';
        }

        query += ' ORDER BY L.CreatedAt DESC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. جلب Lead واحد بالتفاصيل
const getLeadById = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);

        const result = await request.query(`
            SELECT 
                L.*,
                B.branchName AS BranchName,
                S.SourceName AS SourceName,
                E.empName AS AssignedToName,
                C.CustomerID AS ConvertedCustomerId,
                C.FullName AS ConvertedCustomerName
            FROM tbl_Leads L
            LEFT JOIN tbl_Branch B ON L.BranchPreference = B.IDbranch
            LEFT JOIN tbl_LeadSources S ON L.SourceID = S.SourceID
            LEFT JOIN tbl_empolyee E ON L.AssignedTo = E.ID
            LEFT JOIN tbl_Customers C ON L.ConvertedToCustomerID = C.CustomerID
            WHERE L.LeadID = @id AND L.IsDeleted = 0
        `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'العميل المحتمل غير موجود' });
        }

        res.status(200).json(result.recordset[0]);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. تعديل بيانات Lead
const updateLead = async (req, res) => {
    const { id } = req.params;
    const { 
        fullName,
        phone,
        email,
        childAge,
        source,
        sourceId,
        interestedProgram,
        branchId,
        assignedTo,
        nextFollowUp,
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
        request.input('mail', sql.NVarChar, email || null);
        request.input('age', sql.Int, childAge || null);
        request.input('src', sql.NVarChar, source || null);
        request.input('sourceId', sql.Int, sourceId || null);
        request.input('prog', sql.NVarChar, interestedProgram || null);
        request.input('branch', sql.SmallInt, branchId || null);
        request.input('assignedTo', sql.Int, assignedTo || null);
        request.input('next', sql.DateTime, nextFollowUp ? new Date(nextFollowUp) : null);
        request.input('notes', sql.NVarChar, notes || null);
        request.input('status', sql.NVarChar, status || 'New');
        request.input('useredit', sql.VarChar, useredit || null);
        request.input('editTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            UPDATE tbl_Leads 
            SET FullName = @name,
                Phone = @phone,
                Email = @mail,
                ChildAge = @age,
                LeadSource = @src,
                SourceID = @sourceId,
                InterestedProgram = @prog,
                BranchPreference = @branch,
                AssignedTo = @assignedTo,
                NextFollowUp = @next,
                Notes = @notes,
                Status = @status,
                UpdatedAt = @editTime,
                useredit = @useredit,
                editTime = @editTime
            WHERE LeadID = @id AND IsDeleted = 0
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'العميل المحتمل غير موجود' });
        }

        res.status(200).json({ message: 'تم تعديل بيانات العميل المحتمل بنجاح ✅' });

    } catch (err) {
        console.error('updateLead error:', err);
        res.status(500).json({ error: err.message });
    }
};

// 5. تحديث حالة Lead فقط
const updateLeadStatus = async (req, res) => {
    const { id } = req.params;
    const { status, useredit, clientTime } = req.body;

    if (!status) {
        return res.status(400).json({ message: 'status مطلوب' });
    }

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('status', sql.NVarChar, status);
        request.input('useredit', sql.VarChar, useredit || null);
        request.input('editTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            UPDATE tbl_Leads
            SET Status = @status,
                UpdatedAt = @editTime,
                useredit = @useredit,
                editTime = @editTime
            WHERE LeadID = @id AND IsDeleted = 0
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'العميل المحتمل غير موجود' });
        }

        res.status(200).json({ message: 'تم تحديث حالة العميل المحتمل ✅' });
    } catch (err) {
        console.error('updateLeadStatus error:', err);
        res.status(500).json({ error: err.message });
    }
};

// 6. حذف Lead (Soft Delete)
const deleteLead = async (req, res) => {
    const { id } = req.params;
    const { useredit, clientTime } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('useredit', sql.VarChar, useredit || null);
        request.input('editTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            UPDATE tbl_Leads 
            SET IsDeleted = 1,
                UpdatedAt = @editTime,
                useredit = @useredit,
                editTime = @editTime
            WHERE LeadID = @id
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'العميل المحتمل غير موجود' });
        }

        res.status(200).json({ message: 'تم حذف العميل المحتمل بنجاح ✅' });

    } catch (err) {
        console.error('deleteLead error:', err);
        res.status(500).json({ error: err.message });
    }
};

// 7. تحويل Lead إلى Customer
const convertLeadToCustomer = async (req, res) => {
    const { leadId } = req.params;
    const { userAdd, clientTime } = req.body;

    const transaction = new sql.Transaction();

    try {
        await transaction.begin();

        const leadRequest = new sql.Request(transaction);
        leadRequest.input('id', sql.Int, leadId);

        const leadData = await leadRequest.query(`
            SELECT * 
            FROM tbl_Leads 
            WHERE LeadID = @id AND IsDeleted = 0
        `);
        
        if (leadData.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ message: 'العميل المحتمل غير موجود' });
        }

        const lead = leadData.recordset[0];

        if (lead.Status === 'Converted') {
            await transaction.rollback();
            return res.status(400).json({ message: 'تم تحويل هذا العميل مسبقاً' });
        }

        const custRequest = new sql.Request(transaction);
        custRequest.input('name', sql.NVarChar, lead.FullName);
        custRequest.input('phone', sql.NVarChar, lead.Phone);
        custRequest.input('email', sql.NVarChar, lead.Email);
        custRequest.input('userAdd', sql.VarChar, userAdd || null);
        custRequest.input('addTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const custResult = await custRequest.query(`
            INSERT INTO tbl_Customers 
            (FullName, Phone, Email, Status, CustomerType, CreatedAt, userAdd, Addtime)
            OUTPUT inserted.CustomerID
            VALUES (@name, @phone, @email, 'Active', 'Parent', @addTime, @userAdd, @addTime)
        `);

        const newCustID = custResult.recordset[0].CustomerID;

        const updateRequest = new sql.Request(transaction);
        updateRequest.input('lid', sql.Int, leadId);
        updateRequest.input('cid', sql.Int, newCustID);
        updateRequest.input('useredit', sql.VarChar, userAdd || null);
        updateRequest.input('editTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        await updateRequest.query(`
            UPDATE tbl_Leads 
            SET Status = 'Converted', 
                ConvertedToCustomerID = @cid, 
                ConversionDate = @editTime,
                UpdatedAt = @editTime,
                useredit = @useredit,
                editTime = @editTime
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

// 8. جلب الـ Leads اللي محتاجين متابعة
const getLeadsNeedFollowUp = async (req, res) => {
    const { assignedTo } = req.query;

    try {
        const request = new sql.Request();

        let query = `
            SELECT 
                L.LeadID,
                L.FullName,
                L.Phone,
                L.Email,
                L.ChildAge,
                L.Status,
                L.NextFollowUp,
                L.Notes,
                L.AssignedTo,
                B.branchName AS BranchName,
                S.SourceName AS SourceName,
                E.empName AS AssignedToName,
                DATEDIFF(DAY, L.NextFollowUp, GETDATE()) AS DaysOverdue
            FROM tbl_Leads L
            LEFT JOIN tbl_Branch B ON L.BranchPreference = B.IDbranch
            LEFT JOIN tbl_LeadSources S ON L.SourceID = S.SourceID
            LEFT JOIN tbl_empolyee E ON L.AssignedTo = E.ID
            WHERE L.IsDeleted = 0 
              AND L.Status NOT IN ('Converted', 'Lost')
              AND L.NextFollowUp IS NOT NULL
              AND L.NextFollowUp <= GETDATE()
        `;

        if (assignedTo) {
            request.input('empId', sql.Int, assignedTo);
            query += ' AND L.AssignedTo = @empId';
        }

        query += ' ORDER BY L.NextFollowUp ASC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('getLeadsNeedFollowUp error:', err);
        res.status(500).json({ error: err.message });
    }
};

// 9. جلب متابعات اليوم
const getTodayFollowUps = async (req, res) => {
    const { assignedTo } = req.query;

    try {
        const request = new sql.Request();

        let query = `
            SELECT 
                L.LeadID,
                L.FullName,
                L.Phone,
                L.Email,
                L.ChildAge,
                L.Status,
                L.NextFollowUp,
                L.Notes,
                L.AssignedTo,
                B.branchName AS BranchName,
                S.SourceName AS SourceName,
                E.empName AS AssignedToName
            FROM tbl_Leads L
            LEFT JOIN tbl_Branch B ON L.BranchPreference = B.IDbranch
            LEFT JOIN tbl_LeadSources S ON L.SourceID = S.SourceID
            LEFT JOIN tbl_empolyee E ON L.AssignedTo = E.ID
            WHERE L.IsDeleted = 0 
              AND L.Status NOT IN ('Converted', 'Lost')
              AND CAST(L.NextFollowUp AS DATE) = CAST(GETDATE() AS DATE)
        `;

        if (assignedTo) {
            request.input('empId', sql.Int, assignedTo);
            query += ' AND L.AssignedTo = @empId';
        }

        query += ' ORDER BY L.NextFollowUp ASC';

        const result = await request.query(query);
        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('getTodayFollowUps error:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    createLead,
    getLeads,
    getLeadById,
    updateLead,
    updateLeadStatus,
    deleteLead,
    convertLeadToCustomer,
    getLeadsNeedFollowUp,
    getTodayFollowUps
};