const { sql } = require('../config/db');

// ✅ 1. تحليل مصادر العملاء (Lead Sources Analytics)
// يجيب: عدد Leads، عدد Converted، نسبة التحويل، التكلفة
// ✅ 1. تحليل مصادر العملاء (Lead Sources Analytics)
const getLeadSourceAnalytics = async (req, res) => {
    const { startDate, endDate, branchId } = req.query;

    try {
        const request = new sql.Request();
        
        // شروط الوقت والفرع
        let dateCondition = '';
        let branchCondition = '';

        if (startDate && endDate) {
            request.input('startDate', sql.DateTime, new Date(startDate));
            request.input('endDate', sql.DateTime, new Date(endDate));
            dateCondition = 'AND L.CreatedAt BETWEEN @startDate AND @endDate';
        }

        if (branchId) {
            request.input('branchId', sql.Int, branchId);
            branchCondition = 'AND L.BranchPreference = @branchId';
        }

        // الاستعلام مع JOIN على tbl_LeadSources
        const query = `
            SELECT 
                COALESCE(S.SourceName, N'غير محدد') AS SourceName,
                S.SourceIcon,
                S.SourceColor,
                COUNT(*) AS TotalLeads,
                SUM(CASE WHEN L.Status = 'Converted' THEN 1 ELSE 0 END) AS ConvertedLeads,
                SUM(CASE WHEN L.Status IN ('Lost', 'Not Interested') THEN 1 ELSE 0 END) AS LostLeads
            FROM tbl_Leads L
            LEFT JOIN tbl_LeadSources S ON L.SourceID = S.SourceID
            WHERE L.IsDeleted = 0 
            ${dateCondition} 
            ${branchCondition}
            GROUP BY 
                S.SourceName,
                S.SourceIcon,
                S.SourceColor
            ORDER BY COUNT(*) DESC
        `;

        const result = await request.query(query);

        // معالجة البيانات وإضافة النسب
        const analytics = result.recordset.map(row => {
            const conversionRate = row.TotalLeads > 0 
                ? ((row.ConvertedLeads / row.TotalLeads) * 100).toFixed(1) 
                : 0;

            return {
                source: row.SourceName,
                icon: row.SourceIcon || 'other',
                color: row.SourceColor || null,
                leads: row.TotalLeads,
                converted: row.ConvertedLeads,
                lost: row.LostLeads || 0,
                rate: parseFloat(conversionRate),
                cost: 0,
                cpl: 0
            };
        });

        res.status(200).json(analytics);

    } catch (err) {
        console.error('getLeadSourceAnalytics error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 2. تحليل الحملات الإعلانية (Campaigns Performance)
const getCampaignAnalytics = async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT 
                C.CampaignID,
                C.CampaignName,
                C.Budget,
                C.StartDate,
                C.EndDate,
                C.Status,
                -- عدد الـ Leads اللي جم من الحملة دي
                (SELECT COUNT(*) FROM tbl_Leads L WHERE L.LeadSource = C.CampaignName AND L.IsDeleted = 0) AS LeadsCount,
                -- عدد الـ Leads المحولين
                (SELECT COUNT(*) FROM tbl_Leads L WHERE L.LeadSource = C.CampaignName AND L.Status = 'Converted' AND L.IsDeleted = 0) AS ConvertedCount
            FROM tbl_Campaigns C
            WHERE C.IsDeleted = 0
            ORDER BY C.StartDate DESC
        `);

        const analytics = result.recordset.map(row => {
            const cpl = (row.Budget && row.LeadsCount > 0) 
                ? (row.Budget / row.LeadsCount).toFixed(2) 
                : 0;
            
            return {
                ...row,
                CostPerLead: parseFloat(cpl)
            };
        });

        res.status(200).json(analytics);

    } catch (err) {
        console.error('getCampaignAnalytics error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 3. ملخص الأداء العام (Dashboard KPI)
const getDashboardKPIs = async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT
                (SELECT COUNT(*) FROM tbl_Leads WHERE IsDeleted = 0) AS TotalLeads,
                (SELECT COUNT(*) FROM tbl_Leads WHERE Status = 'New' AND IsDeleted = 0) AS NewLeads,
                (SELECT COUNT(*) FROM tbl_Leads WHERE Status = 'Converted' AND IsDeleted = 0) AS ConvertedLeads,
                (SELECT COUNT(*) FROM tbl_Customers WHERE IsDeleted = 0) AS TotalCustomers,
                (SELECT COUNT(*) FROM tbl_Interactions WHERE CAST(InteractionDate AS DATE) = CAST(GETDATE() AS DATE)) AS TodayInteractions,
                (SELECT COUNT(*) FROM tbl_Tasks WHERE Status = 'Pending' AND IsDeleted = 0) AS PendingTasks
        `);

        const kpi = result.recordset[0];
        
        // حساب نسبة التحويل العامة
        kpi.ConversionRate = kpi.TotalLeads > 0 
            ? ((kpi.ConvertedLeads / kpi.TotalLeads) * 100).toFixed(1) 
            : 0;

        res.status(200).json(kpi);

    } catch (err) {
        console.error('getDashboardKPIs error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 4. نشاط الموظفين (User Activity)
const getEmployeePerformance = async (req, res) => {
    const { month, year } = req.query; // اختياري

    try {
        const request = new sql.Request();
        
        let dateFilter = '';
        if (month && year) {
            request.input('m', sql.Int, month);
            request.input('y', sql.Int, year);
            dateFilter = 'AND MONTH(InteractionDate) = @m AND YEAR(InteractionDate) = @y';
        }

        const result = await request.query(`
            SELECT 
                U.FullName AS EmployeeName,
                COUNT(I.InteractionID) AS TotalInteractions,
                SUM(CASE WHEN I.InteractionType = 'Call' THEN 1 ELSE 0 END) AS Calls,
                SUM(CASE WHEN I.InteractionType = 'Visit' THEN 1 ELSE 0 END) AS Visits,
                SUM(CASE WHEN I.InteractionType = 'WhatsApp' THEN 1 ELSE 0 END) AS WhatsApp
            FROM tbl_users U
            LEFT JOIN tbl_Interactions I ON U.UserId = I.CreatedBy
            WHERE U.Role != 'Admin' ${dateFilter}
            GROUP BY U.FullName
            ORDER BY TotalInteractions DESC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('getEmployeePerformance error:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getLeadSourceAnalytics,
    getCampaignAnalytics,
    getDashboardKPIs,
    getEmployeePerformance
};