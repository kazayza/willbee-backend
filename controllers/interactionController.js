const { sql } = require('../config/db');

// ✅ 1. تسجيل تفاعل جديد (يدعم Customer أو Lead)
const addInteraction = async (req, res) => {
    const { 
        customerId, 
        leadId,
        type, 
        subject, 
        details, 
        outcome,
        durationMinutes,
        assignedTo,
        followUpRequired,
        followUpDate,
        followUpNotes,
        nextFollowUp,      // 🆕 ميعاد المتابعة الجاية للـ Lead/Customer
        userAdd,
        clientTime 
    } = req.body;

    if (!customerId && !leadId) {
        return res.status(400).json({ message: 'customerId أو leadId مطلوب' });
    }

    if (!type || !subject) {
        return res.status(400).json({ message: 'type و subject مطلوبين' });
    }

    try {
        const request = new sql.Request();
        request.input('custId', sql.Int, customerId || null);
        request.input('leadId', sql.Int, leadId || null);
        request.input('type', sql.NVarChar, type);
        request.input('subj', sql.NVarChar, subject);
        request.input('det', sql.NVarChar, details || null);
        request.input('out', sql.NVarChar, outcome || null);
        request.input('duration', sql.Int, durationMinutes || null);
        request.input('assigned', sql.Int, assignedTo || null);
        request.input('followReq', sql.Bit, followUpRequired || false);
        request.input('followDate', sql.DateTime, followUpDate ? new Date(followUpDate) : null);
        request.input('followNotes', sql.NVarChar, followUpNotes || null);
        request.input('userAdd', sql.VarChar, userAdd || null);
        request.input('addTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());
        request.input('createdBy', sql.Int, assignedTo || null);
        await request.query(`
            INSERT INTO tbl_Interactions 
            (
                CustomerID, 
                LeadID, 
                InteractionType, 
                Subject, 
                Details, 
                Outcome, 
                DurationMinutes, 
                AssignedTo, 
                FollowUpRequired, 
                FollowUpDate, 
                FollowUpNotes,
                InteractionDate, 
                CreatedAt, 
                IsDeleted,
                userAdd,
                Addtime,
                CreatedBy
            )
            VALUES 
            (
                @custId, 
                @leadId, 
                @type, 
                @subj, 
                @det, 
                @out,
                @duration, 
                @assigned, 
                @followReq, 
                @followDate, 
                @followNotes,
                @addTime, 
                @addTime, 
                0,
                @userAdd,
                @addTime,
                @createdBy
            )
        `);

        // 🆕 1️⃣ تحديث ميعاد المتابعة الجاية (لو اتبعت)
        if (nextFollowUp) {
            const followUpReq = new sql.Request();
            followUpReq.input('nextDate', sql.DateTime, new Date(nextFollowUp));

            if (leadId) {
                followUpReq.input('leadId', sql.Int, leadId);
                await followUpReq.query(`
                    UPDATE tbl_Leads 
                    SET NextFollowUp = @nextDate
                    WHERE LeadID = @leadId AND IsDeleted = 0
                `);
            }

            if (customerId) {
                followUpReq.input('custId', sql.Int, customerId);
                await followUpReq.query(`
                    UPDATE tbl_Customers 
                    SET NextFollowUpDate = @nextDate
                    WHERE CustomerID = @custId AND IsDeleted = 0
                `);
            }
        }
        
        if (leadId) {
    const updateRequest = new sql.Request();
    updateRequest.input('leadId', sql.Int, leadId);
    updateRequest.input('editTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());
    updateRequest.input('useredit', sql.VarChar, userAdd || null);

    await updateRequest.query(`
        UPDATE tbl_Leads 
        SET Status = 'Contacted',
            UpdatedAt = @editTime,
            useredit = @useredit,
            editTime = @editTime
        WHERE LeadID = @leadId 
          AND Status = 'New'
          AND IsDeleted = 0
    `);
}
        res.status(201).json({ message: 'تم تسجيل التفاعل بنجاح ✅' });
    } catch (err) {
        console.error('addInteraction error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 2. جلب تفاعلات عميل (Customer)
const getCustomerInteractions = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('custId', sql.Int, id);

        const result = await request.query(`
            SELECT 
                I.InteractionID,
                I.CustomerID,
                I.LeadID,
                I.InteractionType,
                I.Subject,
                I.Details,
                I.Outcome,
                I.DurationMinutes,
                I.AssignedTo,
                I.FollowUpRequired,
                I.FollowUpDate,
                I.FollowUpNotes,
                I.InteractionDate,
                I.CreatedAt,
                I.userAdd,
                I.Addtime,
                I.useredit,
                I.editTime,
                E.empName AS AssignedToName
            FROM tbl_Interactions I
            LEFT JOIN tbl_empolyee E ON I.AssignedTo = E.ID
            WHERE I.CustomerID = @custId AND I.IsDeleted = 0
            ORDER BY I.InteractionDate DESC
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('getCustomerInteractions error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 3. جلب تفاعلات عميل محتمل (Lead)
const getLeadInteractions = async (req, res) => {
    const { id } = req.params;

    try {
        const request = new sql.Request();
        request.input('leadId', sql.Int, id);

        const result = await request.query(`
            SELECT 
                I.InteractionID,
                I.CustomerID,
                I.LeadID,
                I.InteractionType,
                I.Subject,
                I.Details,
                I.Outcome,
                I.DurationMinutes,
                I.AssignedTo,
                I.FollowUpRequired,
                I.FollowUpDate,
                I.FollowUpNotes,
                I.InteractionDate,
                I.CreatedAt,
                I.userAdd,
                I.Addtime,
                I.useredit,
                I.editTime,
                E.empName AS AssignedToName
            FROM tbl_Interactions I
            LEFT JOIN tbl_empolyee E ON I.AssignedTo = E.ID
            WHERE I.LeadID = @leadId AND I.IsDeleted = 0
            ORDER BY I.InteractionDate DESC
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('getLeadInteractions error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 4. جلب كل التفاعلات لشخص (Lead + Customer معاً)
const getAllInteractionsForPerson = async (req, res) => {
    const { customerId, leadId } = req.query;

    if (!customerId && !leadId) {
        return res.status(400).json({ message: 'customerId أو leadId مطلوب' });
    }

    try {
        const request = new sql.Request();
        
        let conditions = [];

        if (customerId) {
            request.input('custId', sql.Int, customerId);
            conditions.push('I.CustomerID = @custId');
        }

        if (leadId) {
            request.input('leadId', sql.Int, leadId);
            conditions.push('I.LeadID = @leadId');
        }

        const query = `
            SELECT 
                I.InteractionID,
                I.CustomerID,
                I.LeadID,
                I.InteractionType,
                I.Subject,
                I.Details,
                I.Outcome,
                I.DurationMinutes,
                I.AssignedTo,
                I.FollowUpRequired,
                I.FollowUpDate,
                I.FollowUpNotes,
                I.InteractionDate,
                I.CreatedAt,
                I.userAdd,
                I.Addtime,
                I.useredit,
                I.editTime,
                E.empName AS AssignedToName
            FROM tbl_Interactions I
            LEFT JOIN tbl_empolyee E ON I.AssignedTo = E.ID
            WHERE I.IsDeleted = 0 AND (${conditions.join(' OR ')})
            ORDER BY I.InteractionDate DESC
        `;

        const result = await request.query(query);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('getAllInteractionsForPerson error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 5. البحث الموحد (Leads + Customers) مع عدد التفاعلات
const searchAllContacts = async (req, res) => {
    const { query, type } = req.query;

    try {
        const searchTerm = query ? `%${query}%` : '%';
        let results = [];

        if (!type || type === 'all' || type === 'leads') {
            const requestLeads = new sql.Request();
            requestLeads.input('search', sql.NVarChar, searchTerm);

            const leadsResult = await requestLeads.query(`
                SELECT 
                    L.LeadID AS ID,
                    'Lead' AS ContactType,
                    L.FullName,
                    L.Phone,
                    L.Email,
                    L.Status,
                    NULL AS ChildName,
                    (SELECT COUNT(*) FROM tbl_Interactions WHERE LeadID = L.LeadID AND IsDeleted = 0) AS InteractionsCount,
                    (SELECT TOP 1 InteractionDate FROM tbl_Interactions WHERE LeadID = L.LeadID AND IsDeleted = 0 ORDER BY InteractionDate DESC) AS LastInteraction
                FROM tbl_Leads L
                WHERE L.IsDeleted = 0 
                AND (L.FullName LIKE @search OR L.Phone LIKE @search)
            `);
            
            results = [...results, ...leadsResult.recordset];
        }

        if (!type || type === 'all' || type === 'customers') {
            const requestCustomers = new sql.Request();
            requestCustomers.input('search', sql.NVarChar, searchTerm);

            const customersResult = await requestCustomers.query(`
                SELECT 
                    C.CustomerID AS ID,
                    'Customer' AS ContactType,
                    C.FullName,
                    C.Phone,
                    C.Email,
                    C.Status,
                    CH.FullNameArabic AS ChildName,
                    (SELECT COUNT(*) FROM tbl_Interactions WHERE CustomerID = C.CustomerID AND IsDeleted = 0) AS InteractionsCount,
                    (SELECT TOP 1 InteractionDate FROM tbl_Interactions WHERE CustomerID = C.CustomerID AND IsDeleted = 0 ORDER BY InteractionDate DESC) AS LastInteraction
                FROM tbl_Customers C
                LEFT JOIN tbl_Child CH ON C.ChildID = CH.ID_Child
                WHERE C.IsDeleted = 0 
                AND (C.FullName LIKE @search OR C.Phone LIKE @search)
            `);

            results = [...results, ...customersResult.recordset];
        }

        results.sort((a, b) => {
            if (!a.LastInteraction) return 1;
            if (!b.LastInteraction) return -1;
            return new Date(b.LastInteraction) - new Date(a.LastInteraction);
        });

        res.status(200).json(results);
    } catch (err) {
        console.error('searchAllContacts error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 6. تعديل تفاعل
const updateInteraction = async (req, res) => {
    const { id } = req.params;
    const { 
        type, 
        subject, 
        details, 
        outcome,
        durationMinutes,
        followUpRequired,
        followUpDate,
        followUpNotes,
        useredit,
        clientTime 
    } = req.body;

    if (!type || !subject) {
        return res.status(400).json({ message: 'type و subject مطلوبين' });
    }

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('type', sql.NVarChar, type);
        request.input('subj', sql.NVarChar, subject);
        request.input('det', sql.NVarChar, details || null);
        request.input('out', sql.NVarChar, outcome || null);
        request.input('duration', sql.Int, durationMinutes || null);
        request.input('followReq', sql.Bit, followUpRequired || false);
        request.input('followDate', sql.DateTime, followUpDate ? new Date(followUpDate) : null);
        request.input('followNotes', sql.NVarChar, followUpNotes || null);
        request.input('useredit', sql.VarChar, useredit || null);
        request.input('editTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            UPDATE tbl_Interactions 
            SET InteractionType = @type,
                Subject = @subj,
                Details = @det,
                Outcome = @out,
                DurationMinutes = @duration,
                FollowUpRequired = @followReq,
                FollowUpDate = @followDate,
                FollowUpNotes = @followNotes,
                useredit = @useredit,
                editTime = @editTime
            WHERE InteractionID = @id AND IsDeleted = 0
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'التفاعل غير موجود' });
        }

        res.status(200).json({ message: 'تم تعديل التفاعل بنجاح ✅' });
    } catch (err) {
        console.error('updateInteraction error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 7. حذف تفاعل (Soft Delete)
const deleteInteraction = async (req, res) => {
    const { id } = req.params;
    const { useredit, clientTime } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('useredit', sql.VarChar, useredit || null);
        request.input('editTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            UPDATE tbl_Interactions 
            SET IsDeleted = 1,
                useredit = @useredit,
                editTime = @editTime
            WHERE InteractionID = @id
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'التفاعل غير موجود' });
        }

        res.status(200).json({ message: 'تم حذف التفاعل بنجاح ✅' });
    } catch (err) {
        console.error('deleteInteraction error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 8. إحصائيات التفاعلات لشخص معين
const getInteractionStats = async (req, res) => {
    const { customerId, leadId } = req.query;

    if (!customerId && !leadId) {
        return res.status(400).json({ message: 'customerId أو leadId مطلوب' });
    }

    try {
        const request = new sql.Request();
        
        let condition = '';
        if (customerId) {
            request.input('custId', sql.Int, customerId);
            condition = 'CustomerID = @custId';
        } else {
            request.input('leadId', sql.Int, leadId);
            condition = 'LeadID = @leadId';
        }

        const result = await request.query(`
            SELECT 
                InteractionType,
                COUNT(*) AS Count
            FROM tbl_Interactions
            WHERE ${condition} AND IsDeleted = 0
            GROUP BY InteractionType
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('getInteractionStats error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 9. جلب التفاعلات اللي محتاجة متابعة
const getInteractionsNeedFollowUp = async (req, res) => {
    try {
        const request = new sql.Request();

        const result = await request.query(`
            SELECT 
                I.InteractionID,
                I.CustomerID,
                I.LeadID,
                I.InteractionType,
                I.Subject,
                I.FollowUpDate,
                I.FollowUpNotes,
                I.AssignedTo,
                C.FullName AS CustomerName,
                C.Phone AS CustomerPhone,
                L.FullName AS LeadName,
                L.Phone AS LeadPhone,
                E.empName AS AssignedToName
            FROM tbl_Interactions I
            LEFT JOIN tbl_Customers C ON I.CustomerID = C.CustomerID
            LEFT JOIN tbl_Leads L ON I.LeadID = L.LeadID
            LEFT JOIN tbl_empolyee E ON I.AssignedTo = E.ID
            WHERE I.IsDeleted = 0 
              AND I.FollowUpRequired = 1
              AND I.FollowUpDate IS NOT NULL
              AND I.FollowUpDate <= GETDATE()
            ORDER BY I.FollowUpDate ASC
        `);

        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('getInteractionsNeedFollowUp error:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = { 
    addInteraction, 
    getCustomerInteractions,
    getLeadInteractions,
    getAllInteractionsForPerson,
    searchAllContacts,
    updateInteraction,
    deleteInteraction,
    getInteractionStats,
    getInteractionsNeedFollowUp
};