const { sql } = require('../config/db');

// ✅ 1. جلب كل الحالات النشطة
const getLeadStatuses = async (req, res) => {
    try {
        const request = new sql.Request();
        
        const result = await request.query(`
            SELECT 
                StatusID,
                StatusName,
                StatusLabel,
                StatusColor,
                StatusIcon,
                SortOrder
            FROM tbl_LeadStatuses 
            WHERE IsDeleted = 0 AND IsActive = 1
            ORDER BY SortOrder ASC
        `);
        
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('getLeadStatuses error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 2. تحديث حالة Lead
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

        res.status(200).json({ message: 'تم تحديث الحالة بنجاح ✅' });
    } catch (err) {
        console.error('updateLeadStatus error:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getLeadStatuses,
    updateLeadStatus
};