const { sql } = require('../config/db');

// ═══════════════════════════════════════════════════════════════════════════
// 📊 1. ملخص الـ CRM Dashboard الرئيسي
// ═══════════════════════════════════════════════════════════════════════════
const getCRMDashboardSummary = async (req, res) => {
    const { branchId, dateFrom, dateTo } = req.query;

    try {
        const request = new sql.Request();

        let dateCondition = '';
        if (dateFrom && dateTo) {
            request.input('dateFrom', sql.DateTime, new Date(dateFrom));
            request.input('dateTo', sql.DateTime, new Date(dateTo));
            dateCondition = ' AND L.CreatedAt BETWEEN @dateFrom AND @dateTo';
        }

        let branchCondition = '';
        if (branchId) {
            request.input('branchId', sql.SmallInt, branchId);
            branchCondition = ' AND L.BranchPreference = @branchId';
        }

        // إحصائيات الـ Leads
        const leadsStats = await request.query(`
            SELECT 
                COUNT(*) AS TotalLeads,
                SUM(CASE WHEN Status = 'New' THEN 1 ELSE 0 END) AS NewLeads,
                SUM(CASE WHEN Status = 'Contacted' THEN 1 ELSE 0 END) AS ContactedLeads,
                SUM(CASE WHEN Status = 'Interested' THEN 1 ELSE 0 END) AS InterestedLeads,
                SUM(CASE WHEN Status = 'Converted' THEN 1 ELSE 0 END) AS ConvertedLeads,
                SUM(CASE WHEN Status = 'Lost' THEN 1 ELSE 0 END) AS LostLeads,
                SUM(CASE WHEN Status = 'Follow Up' THEN 1 ELSE 0 END) AS FollowUpLeads
            FROM tbl_Leads L
            WHERE L.IsDeleted = 0 ${dateCondition} ${branchCondition}
        `);

        // إحصائيات العملاء
        const request2 = new sql.Request();
        if (dateFrom && dateTo) {
            request2.input('dateFrom', sql.DateTime, new Date(dateFrom));
            request2.input('dateTo', sql.DateTime, new Date(dateTo));
        }

        let customerDateCondition = '';
        if (dateFrom && dateTo) {
            customerDateCondition = ' AND C.CreatedAt BETWEEN @dateFrom AND @dateTo';
        }

        const customersStats = await request2.query(`
            SELECT 
                COUNT(*) AS TotalCustomers,
                SUM(CASE WHEN Status = 'Active' THEN 1 ELSE 0 END) AS ActiveCustomers,
                SUM(CASE WHEN Status = 'Inactive' THEN 1 ELSE 0 END) AS InactiveCustomers
            FROM tbl_Customers C
            WHERE C.IsDeleted = 0 ${customerDateCondition}
        `);

        // المتابعات المتأخرة
        const request3 = new sql.Request();
        if (branchId) {
            request3.input('branchId', sql.SmallInt, branchId);
        }

        const overdueFollowUps = await request3.query(`
            SELECT COUNT(*) AS OverdueCount
            FROM tbl_Leads L
            WHERE L.IsDeleted = 0 
              AND L.Status NOT IN ('Converted', 'Lost')
              AND L.NextFollowUp IS NOT NULL
              AND L.NextFollowUp < CAST(GETDATE() AS DATE)
              ${branchId ? ' AND L.BranchPreference = @branchId' : ''}
        `);

        // متابعات اليوم
        const request4 = new sql.Request();
        if (branchId) {
            request4.input('branchId', sql.SmallInt, branchId);
        }

        const todayFollowUps = await request4.query(`
            SELECT COUNT(*) AS TodayCount
            FROM tbl_Leads L
            WHERE L.IsDeleted = 0 
              AND L.Status NOT IN ('Converted', 'Lost')
              AND CAST(L.NextFollowUp AS DATE) = CAST(GETDATE() AS DATE)
              ${branchId ? ' AND L.BranchPreference = @branchId' : ''}
        `);

        // إحصائيات التفاعلات
        const request5 = new sql.Request();
        if (dateFrom && dateTo) {
            request5.input('dateFrom', sql.DateTime, new Date(dateFrom));
            request5.input('dateTo', sql.DateTime, new Date(dateTo));
        }

        let interactionDateCondition = '';
        if (dateFrom && dateTo) {
            interactionDateCondition = ' AND I.InteractionDate BETWEEN @dateFrom AND @dateTo';
        }

        const interactionsStats = await request5.query(`
            SELECT 
                COUNT(*) AS TotalInteractions,
                SUM(CASE WHEN InteractionType = 'Call' THEN 1 ELSE 0 END) AS Calls,
                SUM(CASE WHEN InteractionType = 'WhatsApp' THEN 1 ELSE 0 END) AS WhatsApp,
                SUM(CASE WHEN InteractionType = 'Visit' THEN 1 ELSE 0 END) AS Visits,
                SUM(CASE WHEN InteractionType = 'Email' THEN 1 ELSE 0 END) AS Emails
            FROM tbl_Interactions I
            WHERE I.IsDeleted = 0 ${interactionDateCondition}
        `);

        // حساب معدل التحويل
        const leads = leadsStats.recordset[0];
        const conversionRate = leads.TotalLeads > 0 
            ? ((leads.ConvertedLeads / leads.TotalLeads) * 100).toFixed(1)
            : 0;

        res.status(200).json({
            leads: {
                total: leads.TotalLeads,
                new: leads.NewLeads,
                contacted: leads.ContactedLeads,
                interested: leads.InterestedLeads,
                converted: leads.ConvertedLeads,
                lost: leads.LostLeads,
                followUp: leads.FollowUpLeads,
                conversionRate: parseFloat(conversionRate)
            },
            customers: customersStats.recordset[0],
            followUps: {
                overdue: overdueFollowUps.recordset[0].OverdueCount,
                today: todayFollowUps.recordset[0].TodayCount
            },
            interactions: interactionsStats.recordset[0]
        });

    } catch (err) {
        console.error('getCRMDashboardSummary error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📈 2. أداء المصادر (Sources Performance)
// ═══════════════════════════════════════════════════════════════════════════
const getCRMSourcesPerformance = async (req, res) => {
    const { dateFrom, dateTo, branchId } = req.query;

    try {
        const request = new sql.Request();

        let conditions = 'WHERE L.IsDeleted = 0';

        if (dateFrom && dateTo) {
            request.input('dateFrom', sql.DateTime, new Date(dateFrom));
            request.input('dateTo', sql.DateTime, new Date(dateTo));
            conditions += ' AND L.CreatedAt BETWEEN @dateFrom AND @dateTo';
        }

        if (branchId) {
            request.input('branchId', sql.SmallInt, branchId);
            conditions += ' AND L.BranchPreference = @branchId';
        }

        const result = await request.query(`
            SELECT 
                ISNULL(S.SourceName, L.LeadSource) AS SourceName,
                S.SourceColor,
                COUNT(*) AS TotalLeads,
                SUM(CASE WHEN L.Status = 'Converted' THEN 1 ELSE 0 END) AS ConvertedLeads,
                SUM(CASE WHEN L.Status = 'Lost' THEN 1 ELSE 0 END) AS LostLeads,
                CAST(
                    CASE 
                        WHEN COUNT(*) > 0 
                        THEN (SUM(CASE WHEN L.Status = 'Converted' THEN 1 ELSE 0 END) * 100.0 / COUNT(*))
                        ELSE 0 
                    END 
                AS DECIMAL(5,1)) AS ConversionRate
            FROM tbl_Leads L
            LEFT JOIN tbl_LeadSources S ON L.SourceID = S.SourceID
            ${conditions}
            GROUP BY S.SourceName, S.SourceColor, L.LeadSource
            ORDER BY TotalLeads DESC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('getCRMSourcesPerformance error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 👨‍💼 3. أداء الموظفين (Employees Performance)
// ═══════════════════════════════════════════════════════════════════════════
const getCRMEmployeesPerformance = async (req, res) => {
    const { dateFrom, dateTo, branchId } = req.query;

    try {
        const request = new sql.Request();

        let conditions = 'WHERE L.IsDeleted = 0 AND L.AssignedTo IS NOT NULL';

        if (dateFrom && dateTo) {
            request.input('dateFrom', sql.DateTime, new Date(dateFrom));
            request.input('dateTo', sql.DateTime, new Date(dateTo));
            conditions += ' AND L.CreatedAt BETWEEN @dateFrom AND @dateTo';
        }

        if (branchId) {
            request.input('branchId', sql.SmallInt, branchId);
            conditions += ' AND L.BranchPreference = @branchId';
        }

        const result = await request.query(`
            SELECT 
                E.ID AS EmployeeId,
                E.empName AS EmployeeName,
                COUNT(*) AS TotalLeads,
                SUM(CASE WHEN L.Status = 'New' THEN 1 ELSE 0 END) AS NewLeads,
                SUM(CASE WHEN L.Status = 'Contacted' THEN 1 ELSE 0 END) AS ContactedLeads,
                SUM(CASE WHEN L.Status = 'Converted' THEN 1 ELSE 0 END) AS ConvertedLeads,
                SUM(CASE WHEN L.Status = 'Lost' THEN 1 ELSE 0 END) AS LostLeads,
                CAST(
                    CASE 
                        WHEN COUNT(*) > 0 
                        THEN (SUM(CASE WHEN L.Status = 'Converted' THEN 1 ELSE 0 END) * 100.0 / COUNT(*))
                        ELSE 0 
                    END 
                AS DECIMAL(5,1)) AS ConversionRate,
                (SELECT COUNT(*) FROM tbl_Interactions I 
                 WHERE I.AssignedTo = E.ID AND I.IsDeleted = 0) AS TotalInteractions
            FROM tbl_Leads L
            INNER JOIN tbl_empolyee E ON L.AssignedTo = E.ID
            ${conditions}
            GROUP BY E.ID, E.empName
            ORDER BY ConvertedLeads DESC, TotalLeads DESC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('getCRMEmployeesPerformance error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📅 4. إحصائيات الـ Leads حسب الفترة (يومي/أسبوعي/شهري)
// ═══════════════════════════════════════════════════════════════════════════
const getCRMLeadsByPeriod = async (req, res) => {
    const { period, branchId } = req.query;

    try {
        const request = new sql.Request();

        let dateFormat, dateRange;

        switch (period) {
            case 'daily':
                dateFormat = 'CONVERT(VARCHAR(10), L.CreatedAt, 120)';
                dateRange = 'AND L.CreatedAt >= DATEADD(DAY, -30, GETDATE())';
                break;
            case 'weekly':
                dateFormat = "CONVERT(VARCHAR(10), DATEADD(DAY, -(DATEPART(WEEKDAY, L.CreatedAt) - 1), L.CreatedAt), 120)";
                dateRange = 'AND L.CreatedAt >= DATEADD(WEEK, -12, GETDATE())';
                break;
            case 'monthly':
            default:
                dateFormat = "FORMAT(L.CreatedAt, 'yyyy-MM')";
                dateRange = 'AND L.CreatedAt >= DATEADD(MONTH, -12, GETDATE())';
                break;
        }

        let branchCondition = '';
        if (branchId) {
            request.input('branchId', sql.SmallInt, branchId);
            branchCondition = ' AND L.BranchPreference = @branchId';
        }

        const result = await request.query(`
            SELECT 
                ${dateFormat} AS Period,
                COUNT(*) AS TotalLeads,
                SUM(CASE WHEN L.Status = 'Converted' THEN 1 ELSE 0 END) AS ConvertedLeads
            FROM tbl_Leads L
            WHERE L.IsDeleted = 0 ${dateRange} ${branchCondition}
            GROUP BY ${dateFormat}
            ORDER BY Period ASC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('getCRMLeadsByPeriod error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 🏢 5. إحصائيات حسب الفروع
// ═══════════════════════════════════════════════════════════════════════════
const getCRMBranchesPerformance = async (req, res) => {
    const { dateFrom, dateTo } = req.query;

    try {
        const request = new sql.Request();

        let conditions = 'WHERE L.IsDeleted = 0';

        if (dateFrom && dateTo) {
            request.input('dateFrom', sql.DateTime, new Date(dateFrom));
            request.input('dateTo', sql.DateTime, new Date(dateTo));
            conditions += ' AND L.CreatedAt BETWEEN @dateFrom AND @dateTo';
        }

        const result = await request.query(`
            SELECT 
                B.IDbranch AS BranchId,
                B.branchName AS BranchName,
                COUNT(*) AS TotalLeads,
                SUM(CASE WHEN L.Status = 'New' THEN 1 ELSE 0 END) AS NewLeads,
                SUM(CASE WHEN L.Status = 'Converted' THEN 1 ELSE 0 END) AS ConvertedLeads,
                SUM(CASE WHEN L.Status = 'Lost' THEN 1 ELSE 0 END) AS LostLeads,
                CAST(
                    CASE 
                        WHEN COUNT(*) > 0 
                        THEN (SUM(CASE WHEN L.Status = 'Converted' THEN 1 ELSE 0 END) * 100.0 / COUNT(*))
                        ELSE 0 
                    END 
                AS DECIMAL(5,1)) AS ConversionRate
            FROM tbl_Leads L
            INNER JOIN tbl_Branch B ON L.BranchPreference = B.IDbranch
            ${conditions}
            GROUP BY B.IDbranch, B.branchName
            ORDER BY TotalLeads DESC
        `);

        res.status(200).json(result.recordset);

    } catch (err) {
        console.error('getCRMBranchesPerformance error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📊 6. إحصائيات سريعة (للـ Cards في الـ Home)
// ═══════════════════════════════════════════════════════════════════════════
const getCRMQuickStats = async (req, res) => {
    const { empId } = req.query;

    try {
        let empCondition = '';
        if (empId) {
            empCondition = ' AND AssignedTo = @empId';
        }

        // Leads اليوم
        const request1 = new sql.Request();
        if (empId) request1.input('empId', sql.Int, empId);

        const todayLeads = await request1.query(`
            SELECT COUNT(*) AS Count
            FROM tbl_Leads
            WHERE IsDeleted = 0 
              AND CAST(CreatedAt AS DATE) = CAST(GETDATE() AS DATE)
              ${empCondition}
        `);

        // Leads هذا الأسبوع
        const request2 = new sql.Request();
        if (empId) request2.input('empId', sql.Int, empId);

        const weekLeads = await request2.query(`
            SELECT COUNT(*) AS Count
            FROM tbl_Leads
            WHERE IsDeleted = 0 
              AND CreatedAt >= DATEADD(DAY, -7, GETDATE())
              ${empCondition}
        `);

        // Leads هذا الشهر
        const request3 = new sql.Request();
        if (empId) request3.input('empId', sql.Int, empId);

        const monthLeads = await request3.query(`
            SELECT COUNT(*) AS Count
            FROM tbl_Leads
            WHERE IsDeleted = 0 
              AND MONTH(CreatedAt) = MONTH(GETDATE())
              AND YEAR(CreatedAt) = YEAR(GETDATE())
              ${empCondition}
        `);

        // متابعات اليوم
        const request4 = new sql.Request();
        if (empId) request4.input('empId', sql.Int, empId);

        const todayFollowUps = await request4.query(`
            SELECT COUNT(*) AS Count
            FROM tbl_Leads
            WHERE IsDeleted = 0 
              AND Status NOT IN ('Converted', 'Lost')
              AND CAST(NextFollowUp AS DATE) = CAST(GETDATE() AS DATE)
              ${empCondition}
        `);

        // المتابعات المتأخرة
        const request5 = new sql.Request();
        if (empId) request5.input('empId', sql.Int, empId);

        const overdueFollowUps = await request5.query(`
            SELECT COUNT(*) AS Count
            FROM tbl_Leads
            WHERE IsDeleted = 0 
              AND Status NOT IN ('Converted', 'Lost')
              AND NextFollowUp < CAST(GETDATE() AS DATE)
              ${empCondition}
        `);

        // المهام المعلقة
        const request6 = new sql.Request();
        if (empId) request6.input('empId', sql.Int, empId);

        let taskCondition = empId ? ' AND AssignedTo = @empId' : '';

        const pendingTasks = await request6.query(`
            SELECT COUNT(*) AS Count
            FROM tbl_Tasks
            WHERE IsDeleted = 0 
              AND Status = 'Pending'
              ${taskCondition}
        `);

        res.status(200).json({
            todayLeads: todayLeads.recordset[0].Count,
            weekLeads: weekLeads.recordset[0].Count,
            monthLeads: monthLeads.recordset[0].Count,
            todayFollowUps: todayFollowUps.recordset[0].Count,
            overdueFollowUps: overdueFollowUps.recordset[0].Count,
            pendingTasks: pendingTasks.recordset[0].Count
        });

    } catch (err) {
        console.error('getCRMQuickStats error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// 📈 7. تقرير التحويلات (Conversions Report)
// ═══════════════════════════════════════════════════════════════════════════
const getCRMConversionsReport = async (req, res) => {
    const { dateFrom, dateTo, branchId, sourceId } = req.query;

    try {
        const request = new sql.Request();

        let conditions = "WHERE L.IsDeleted = 0 AND L.Status = 'Converted'";

        if (dateFrom && dateTo) {
            request.input('dateFrom', sql.DateTime, new Date(dateFrom));
            request.input('dateTo', sql.DateTime, new Date(dateTo));
            conditions += ' AND L.ConversionDate BETWEEN @dateFrom AND @dateTo';
        }

        if (branchId) {
            request.input('branchId', sql.SmallInt, branchId);
            conditions += ' AND L.BranchPreference = @branchId';
        }

        if (sourceId) {
            request.input('sourceId', sql.Int, sourceId);
            conditions += ' AND L.SourceID = @sourceId';
        }

        const result = await request.query(`
            SELECT 
                L.LeadID,
                L.FullName,
                L.Phone,
                L.ConversionDate,
                L.CreatedAt AS LeadCreatedAt,
                DATEDIFF(DAY, L.CreatedAt, L.ConversionDate) AS DaysToConvert,
                S.SourceName,
                B.branchName AS BranchName,
                E.empName AS AssignedToName,
                C.CustomerID,
                (SELECT COUNT(*) FROM tbl_Interactions I 
                 WHERE I.LeadID = L.LeadID AND I.IsDeleted = 0) AS InteractionsCount
            FROM tbl_Leads L
            LEFT JOIN tbl_LeadSources S ON L.SourceID = S.SourceID
            LEFT JOIN tbl_Branch B ON L.BranchPreference = B.IDbranch
            LEFT JOIN tbl_empolyee E ON L.AssignedTo = E.ID
            LEFT JOIN tbl_Customers C ON L.ConvertedToCustomerID = C.CustomerID
            ${conditions}
            ORDER BY L.ConversionDate DESC
        `);

        const avgDays = result.recordset.length > 0
            ? (result.recordset.reduce((sum, r) => sum + (r.DaysToConvert || 0), 0) / result.recordset.length).toFixed(1)
            : 0;

        res.status(200).json({
            conversions: result.recordset,
            summary: {
                totalConversions: result.recordset.length,
                averageDaysToConvert: parseFloat(avgDays)
            }
        });

    } catch (err) {
        console.error('getCRMConversionsReport error:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getCRMDashboardSummary,
    getCRMSourcesPerformance,
    getCRMEmployeesPerformance,
    getCRMLeadsByPeriod,
    getCRMBranchesPerformance,
    getCRMQuickStats,
    getCRMConversionsReport
};