// controllers/reportIncomeKindController.js
const { sql } = require('../config/db');

// =============================================
// الشاشة الأولى: تقرير الإيرادات حسب الفلاتر
// =============================================
const getIncomesReport = async (req, res) => {
    try {
        const {
            fromDate,
            toDate,
            branchId,
            incomeGroup,
            incomeKindId
        } = req.query;

        // بناء الاستعلام بشكل ديناميكي
        let query = `
            SELECT 
                i.incomeDate,
                i.ID AS incomeHeaderId,
                d.ID AS detailId,
                d.incomeAmount,
                d.Byan,
                d.ReceiptNumber,
                d.date_Pay,
                d.Notes,
                d.child_ID,
                c.FullNameArabic AS childName,
                ik.ID AS incomeKindId,
                ik.incomeKind AS incomeKindName,
                ik.kindGroup AS incomeGroup,
                b.IDbranch AS branchId,
                b.branchName AS branchName
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            INNER JOIN tbl_incomeKind ik ON d.incomeKind = ik.ID
            LEFT JOIN tbl_Child c ON d.child_ID = c.ID_Child
            LEFT JOIN tbl_Branch b ON d.incomBranchtxt = b.IDbranch
            WHERE 1=1
        `;

        const request = new sql.Request();

        // فلترة حسب التاريخ
        if (fromDate) {
            query += ` AND i.incomeDate >= @fromDate`;
            request.input('fromDate', sql.DateTime, new Date(fromDate));
        }
        if (toDate) {
            query += ` AND i.incomeDate <= @toDate`;
            request.input('toDate', sql.DateTime, new Date(toDate));
        }

        // فلترة حسب الفرع
        if (branchId && branchId !== 'all') {
            query += ` AND d.incomBranchtxt = @branchId`;
            request.input('branchId', sql.SmallInt, parseInt(branchId));
        }

        // فلترة حسب المجموعة
        if (incomeGroup && incomeGroup !== 'all') {
            query += ` AND ik.kindGroup = @incomeGroup`;
            request.input('incomeGroup', sql.NVarChar, incomeGroup);
        }

        // فلترة حسب نوع الإيراد
        if (incomeKindId && incomeKindId !== 'all') {
            query += ` AND d.incomeKind = @incomeKindId`;
            request.input('incomeKindId', sql.SmallInt, parseInt(incomeKindId));
        }

        // استبعاد: رصيد افتتاحي للأكاديمية (ID=51) ورصيد مرحل (ID=36)
        query += ` AND ik.ID NOT IN (36, 51)`;

        query += ` ORDER BY i.incomeDate DESC`;

        const result = await request.query(query);

        // حساب الإجماليات والمؤشرات
        const totalAmount = result.recordset.reduce((sum, item) => sum + (item.incomeAmount || 0), 0);
        const totalTransactions = result.recordset.length;
        
        // حساب عدد الأطفال المميزين
        const uniqueChildren = new Set(result.recordset.map(item => item.child_ID).filter(id => id));
        const totalChildren = uniqueChildren.size;

        // تجميع البيانات حسب نوع الإيراد لعمل Pie Chart
        const incomeByKind = {};
        result.recordset.forEach(item => {
            const kindName = item.incomeKindName;
            if (!incomeByKind[kindName]) {
                incomeByKind[kindName] = {
                    kindId: item.incomeKindId,
                    amount: 0,
                    count: 0
                };
            }
            incomeByKind[kindName].amount += item.incomeAmount || 0;
            incomeByKind[kindName].count++;
        });

        // تجميع البيانات حسب المجموعة
        const incomeByGroup = {};
        result.recordset.forEach(item => {
            const group = item.incomeGroup;
            if (!incomeByGroup[group]) {
                incomeByGroup[group] = {
                    amount: 0,
                    count: 0
                };
            }
            incomeByGroup[group].amount += item.incomeAmount || 0;
            incomeByGroup[group].count++;
        });

        // تجميع البيانات حسب الفرع
        const incomeByBranch = {};
        result.recordset.forEach(item => {
            const branchName = item.branchName || 'غير محدد';
            if (!incomeByBranch[branchName]) {
                incomeByBranch[branchName] = {
                    branchId: item.branchId,
                    amount: 0,
                    count: 0
                };
            }
            incomeByBranch[branchName].amount += item.incomeAmount || 0;
            incomeByBranch[branchName].count++;
        });

        // حساب متوسط الإيراد اليومي
        let averageDaily = 0;
        if (fromDate && toDate) {
            const start = new Date(fromDate);
            const end = new Date(toDate);
            const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            averageDaily = totalAmount / daysDiff;
        }

        res.status(200).json({
            success: true,
            data: result.recordset,
            summary: {
                totalAmount,
                totalTransactions,
                totalChildren,
                averageDaily: Math.round(averageDaily * 100) / 100,
                incomeByKind: Object.entries(incomeByKind).map(([name, data]) => ({
                    name,
                    ...data
                })),
                incomeByGroup: Object.entries(incomeByGroup).map(([name, data]) => ({
                    name,
                    ...data
                })),
                incomeByBranch: Object.entries(incomeByBranch).map(([name, data]) => ({
                    name,
                    ...data
                }))
            }
        });

    } catch (err) {
        console.error('Error in getIncomesReport:', err);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في جلب تقرير الإيرادات', 
            error: err.message 
        });
    }
};

// =============================================
// جلب مجموعات الإيراد (للفلتر)
// =============================================
const getIncomeGroups = async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT kindGroup 
            FROM tbl_incomeKind 
            WHERE ID NOT IN (36, 51)
            AND kindGroup IS NOT NULL 
            AND kindGroup != ''
            ORDER BY kindGroup
        `;
        
        const result = await sql.query(query);
        
        res.status(200).json({
            success: true,
            data: result.recordset.map(item => item.kindGroup)
        });
        
    } catch (err) {
        console.error('Error in getIncomeGroups:', err);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في جلب مجموعات الإيراد', 
            error: err.message 
        });
    }
};

// =============================================
// جلب أنواع الإيراد حسب المجموعة
// =============================================
const getIncomeKindsByGroup = async (req, res) => {
    try {
        const { group } = req.query;
        
        let query = `
            SELECT ID, incomeKind, kindGroup 
            FROM tbl_incomeKind 
            WHERE ID NOT IN (36, 51)
        `;
        
        if (group && group !== 'all') {
            query += ` AND kindGroup = @group`;
        }
        
        query += ` ORDER BY incomeKind`;
        
        const request = new sql.Request();
        if (group && group !== 'all') {
            request.input('group', sql.NVarChar, group);
        }
        
        const result = await request.query(query);
        
        res.status(200).json({
            success: true,
            data: result.recordset
        });
        
    } catch (err) {
        console.error('Error in getIncomeKindsByGroup:', err);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في جلب أنواع الإيراد', 
            error: err.message 
        });
    }
};

// =============================================
// الشاشة الثانية: إيرادات طفل محدد
// =============================================
const getChildIncomes = async (req, res) => {
    try {
        const { childId, fromDate, toDate } = req.query;
        
        if (!childId) {
            return res.status(400).json({
                success: false,
                message: 'معرّف الطفل مطلوب'
            });
        }
        
        const request = new sql.Request();
        request.input('childId', sql.Int, parseInt(childId));
        
        let query = `
            SELECT 
                d.ID AS detailId,
                d.incomeAmount,
                d.Byan,
                d.ReceiptNumber,
                d.date_Pay,
                d.Notes,
                d.incomeKind AS incomeKindId,
                ik.incomeKind AS incomeKindName,
                ik.kindGroup,
                i.incomeDate,
                i.ID AS incomeHeaderId,
                i.userAdd
            FROM tbl_incomeDetalis d
            INNER JOIN tbl_income i ON d.IDincome = i.ID
            INNER JOIN tbl_incomeKind ik ON d.incomeKind = ik.ID
            WHERE d.child_ID = @childId
            AND ik.ID NOT IN (36, 51)
        `;
        
        if (fromDate) {
            query += ` AND i.incomeDate >= @fromDate`;
            request.input('fromDate', sql.DateTime, new Date(fromDate));
        }
        if (toDate) {
            query += ` AND i.incomeDate <= @toDate`;
            request.input('toDate', sql.DateTime, new Date(toDate));
        }
        
        query += ` ORDER BY i.incomeDate DESC, d.date_Pay DESC`;
        
        const result = await request.query(query);
        
        // حساب الإجماليات
        const totalAmount = result.recordset.reduce((sum, item) => sum + (item.incomeAmount || 0), 0);
        
        // تجميع حسب نوع الإيراد
        const incomeByKind = {};
        result.recordset.forEach(item => {
            const kindName = item.incomeKindName;
            if (!incomeByKind[kindName]) {
                incomeByKind[kindName] = {
                    amount: 0,
                    count: 0,
                    kindId: item.incomeKindId
                };
            }
            incomeByKind[kindName].amount += item.incomeAmount || 0;
            incomeByKind[kindName].count++;
        });
        
        // تجميع حسب المجموعة
        const incomeByGroup = {};
        result.recordset.forEach(item => {
            const group = item.kindGroup;
            if (!incomeByGroup[group]) {
                incomeByGroup[group] = {
                    amount: 0,
                    count: 0
                };
            }
            incomeByGroup[group].amount += item.incomeAmount || 0;
            incomeByGroup[group].count++;
        });
        
        res.status(200).json({
            success: true,
            data: result.recordset,
            summary: {
                totalAmount,
                totalTransactions: result.recordset.length,
                incomeByKind: Object.entries(incomeByKind).map(([name, data]) => ({
                    name,
                    ...data
                })),
                incomeByGroup: Object.entries(incomeByGroup).map(([name, data]) => ({
                    name,
                    ...data
                }))
            }
        });
        
    } catch (err) {
        console.error('Error in getChildIncomes:', err);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في جلب إيرادات الطفل', 
            error: err.message 
        });
    }
};

// =============================================
// جلب قائمة الأطفال للبحث (AutoComplete)
// =============================================
const getChildrenList = async (req, res) => {
    try {
        const { search, sessionId } = req.query;
        
        let query = `
            SELECT 
                c.ID_Child,
                c.FullNameArabic,
                c.NationalID,
                b.branchName,
                v.ClassName
            FROM tbl_Child c
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            LEFT JOIN vw_ChildrenCurrentClass v ON c.ID_Child = v.ID_Child
            WHERE c.Status = 1
        `;
        
        const request = new sql.Request();
        
        if (sessionId) {
            query += ` AND EXISTS (
                SELECT 1 FROM tbl_FinanceChild f 
                WHERE f.Child_Id = c.ID_Child AND f.SessionID = @sessionId
            )`;
            request.input('sessionId', sql.Int, parseInt(sessionId));
        }
        
        if (search && search.trim()) {
            query += ` AND (c.FullNameArabic LIKE @search OR c.NationalID LIKE @search)`;
            request.input('search', sql.NVarChar, `%${search.trim()}%`);
        }
        
        query += ` ORDER BY c.FullNameArabic`;
        
        const result = await request.query(query);
        
        res.status(200).json({
            success: true,
            data: result.recordset
        });
        
    } catch (err) {
        console.error('Error in getChildrenList:', err);
        res.status(500).json({ 
            success: false, 
            message: 'خطأ في جلب قائمة الأطفال', 
            error: err.message 
        });
    }
};

// =============================================
// دوال التصدير (Excel و PDF)
// =============================================

// 1. تصدير تقرير الإيرادات إلى Excel
const exportIncomesToExcel = async (req, res) => {
    try {
        const {
            fromDate,
            toDate,
            branchId,
            incomeGroup,
            incomeKindId
        } = req.query;

        // نفس استعلام getIncomesReport
        let query = `
            SELECT 
                i.incomeDate,
                d.incomeAmount,
                d.ReceiptNumber,
                d.date_Pay,
                d.child_ID,
                c.FullNameArabic AS childName,
                ik.incomeKind AS incomeKindName,
                ik.kindGroup AS incomeGroup,
                b.branchName
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            INNER JOIN tbl_incomeKind ik ON d.incomeKind = ik.ID
            LEFT JOIN tbl_Child c ON d.child_ID = c.ID_Child
            LEFT JOIN tbl_Branch b ON d.incomBranchtxt = b.IDbranch
            WHERE 1=1
            AND ik.ID NOT IN (36, 51)
        `;

        const request = new sql.Request();

        if (fromDate) {
            query += ` AND i.incomeDate >= @fromDate`;
            request.input('fromDate', sql.DateTime, new Date(fromDate));
        }
        if (toDate) {
            query += ` AND i.incomeDate <= @toDate`;
            request.input('toDate', sql.DateTime, new Date(toDate));
        }
        if (branchId && branchId !== 'all') {
            query += ` AND d.incomBranchtxt = @branchId`;
            request.input('branchId', sql.SmallInt, parseInt(branchId));
        }
        if (incomeGroup && incomeGroup !== 'all') {
            query += ` AND ik.kindGroup = @incomeGroup`;
            request.input('incomeGroup', sql.NVarChar, incomeGroup);
        }
        if (incomeKindId && incomeKindId !== 'all') {
            query += ` AND d.incomeKind = @incomeKindId`;
            request.input('incomeKindId', sql.SmallInt, parseInt(incomeKindId));
        }

        query += ` ORDER BY i.incomeDate DESC`;

        const result = await request.query(query);

        // إنشاء ملف Excel بسيط
        let excelData = [
            ['التاريخ', 'نوع الإيراد', 'المجموعة', 'الطفل', 'الفرع', 'رقم الإيصال', 'المبلغ']
        ];

        result.recordset.forEach(row => {
            excelData.push([
                row.incomeDate ? new Date(row.incomeDate).toLocaleDateString('ar-EG') : '',
                row.incomeKindName || '',
                row.incomeGroup || '',
                row.childName || '',
                row.branchName || '',
                row.ReceiptNumber || '',
                row.incomeAmount || 0
            ]);
        });

        // تحويل إلى CSV مؤقتاً (بسيط وسريع)
        const csvContent = excelData.map(row => row.join(',')).join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=incomes_report.csv');
        res.send('\uFEFF' + csvContent); // إضافة BOM للعربية

    } catch (err) {
        console.error('Error in exportIncomesToExcel:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 2. تصدير تقرير الإيرادات إلى PDF
const exportIncomesToPDF = async (req, res) => {
    try {
        const {
            fromDate,
            toDate,
            branchId,
            incomeGroup,
            incomeKindId
        } = req.query;

        // نفس الاستعلام أعلاه
        let query = `
            SELECT 
                i.incomeDate,
                d.incomeAmount,
                d.ReceiptNumber,
                d.child_ID,
                c.FullNameArabic AS childName,
                ik.incomeKind AS incomeKindName,
                ik.kindGroup AS incomeGroup,
                b.branchName
            FROM tbl_income i
            INNER JOIN tbl_incomeDetalis d ON i.ID = d.IDincome
            INNER JOIN tbl_incomeKind ik ON d.incomeKind = ik.ID
            LEFT JOIN tbl_Child c ON d.child_ID = c.ID_Child
            LEFT JOIN tbl_Branch b ON d.incomBranchtxt = b.IDbranch
            WHERE 1=1
            AND ik.ID NOT IN (36, 51)
        `;

        const request = new sql.Request();

        if (fromDate) {
            query += ` AND i.incomeDate >= @fromDate`;
            request.input('fromDate', sql.DateTime, new Date(fromDate));
        }
        if (toDate) {
            query += ` AND i.incomeDate <= @toDate`;
            request.input('toDate', sql.DateTime, new Date(toDate));
        }
        if (branchId && branchId !== 'all') {
            query += ` AND d.incomBranchtxt = @branchId`;
            request.input('branchId', sql.SmallInt, parseInt(branchId));
        }
        if (incomeGroup && incomeGroup !== 'all') {
            query += ` AND ik.kindGroup = @incomeGroup`;
            request.input('incomeGroup', sql.NVarChar, incomeGroup);
        }
        if (incomeKindId && incomeKindId !== 'all') {
            query += ` AND d.incomeKind = @incomeKindId`;
            request.input('incomeKindId', sql.SmallInt, parseInt(incomeKindId));
        }

        query += ` ORDER BY i.incomeDate DESC`;

        const result = await request.query(query);

        // حساب الإجمالي
        const totalAmount = result.recordset.reduce((sum, row) => sum + (row.incomeAmount || 0), 0);

        // إنشاء HTML بسيط للـ PDF
        let htmlContent = `
            <html dir="rtl">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    h1 { color: #4CAF50; text-align: center; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
                    th { background-color: #4CAF50; color: white; }
                    .total { font-size: 18px; font-weight: bold; margin-top: 20px; text-align: left; }
                </style>
            </head>
            <body>
                <h1>تقرير الإيرادات</h1>
                <p>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
                <table>
                    <tr>
                        <th>التاريخ</th>
                        <th>نوع الإيراد</th>
                        <th>المجموعة</th>
                        <th>الطفل</th>
                        <th>الفرع</th>
                        <th>المبلغ</th>
                    </tr>
        `;

        result.recordset.forEach(row => {
            htmlContent += `
                <tr>
                    <td>${row.incomeDate ? new Date(row.incomeDate).toLocaleDateString('ar-EG') : ''}</td>
                    <td>${row.incomeKindName || ''}</td>
                    <td>${row.incomeGroup || ''}</td>
                    <td>${row.childName || ''}</td>
                    <td>${row.branchName || ''}</td>
                    <td>${(row.incomeAmount || 0).toFixed(2)} ج.م</td>
                </tr>
            `;
        });

        htmlContent += `
                </table>
                <div class="total">إجمالي الإيرادات: ${totalAmount.toFixed(2)} ج.م</div>
            </body>
            </html>
        `;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=incomes_report.html');
        res.send(htmlContent);

    } catch (err) {
        console.error('Error in exportIncomesToPDF:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 3. تصدير إيرادات الطفل إلى Excel
const exportChildIncomesToExcel = async (req, res) => {
    try {
        const { childId, fromDate, toDate } = req.query;

        if (!childId) {
            return res.status(400).json({ success: false, message: 'childId required' });
        }

        const request = new sql.Request();
        request.input('childId', sql.Int, parseInt(childId));

        let query = `
            SELECT 
                i.incomeDate,
                d.incomeAmount,
                d.ReceiptNumber,
                d.date_Pay,
                d.Byan,
                d.Notes,
                ik.incomeKind AS incomeKindName,
                ik.kindGroup
            FROM tbl_incomeDetalis d
            INNER JOIN tbl_income i ON d.IDincome = i.ID
            INNER JOIN tbl_incomeKind ik ON d.incomeKind = ik.ID
            WHERE d.child_ID = @childId
            AND ik.ID NOT IN (36, 51)
        `;

        if (fromDate) {
            query += ` AND i.incomeDate >= @fromDate`;
            request.input('fromDate', sql.DateTime, new Date(fromDate));
        }
        if (toDate) {
            query += ` AND i.incomeDate <= @toDate`;
            request.input('toDate', sql.DateTime, new Date(toDate));
        }

        query += ` ORDER BY i.incomeDate DESC`;

        const result = await request.query(query);

        const totalAmount = result.recordset.reduce((sum, row) => sum + (row.incomeAmount || 0), 0);

        let csvData = [
            ['التاريخ', 'نوع الإيراد', 'المجموعة', 'البيان', 'رقم الإيصال', 'المبلغ', 'ملاحظات']
        ];

        result.recordset.forEach(row => {
            csvData.push([
                row.incomeDate ? new Date(row.incomeDate).toLocaleDateString('ar-EG') : '',
                row.incomeKindName || '',
                row.kindGroup || '',
                row.Byan || '',
                row.ReceiptNumber || '',
                row.incomeAmount || 0,
                row.Notes || ''
            ]);
        });

        csvData.push(['', '', '', '', 'الإجمالي', totalAmount.toFixed(2), '']);

        const csvContent = csvData.map(row => row.join(',')).join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=child_income_${childId}.csv`);
        res.send('\uFEFF' + csvContent);

    } catch (err) {
        console.error('Error in exportChildIncomesToExcel:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 4. تصدير إيرادات الطفل إلى PDF
const exportChildIncomesToPDF = async (req, res) => {
    try {
        const { childId, fromDate, toDate } = req.query;

        if (!childId) {
            return res.status(400).json({ success: false, message: 'childId required' });
        }

        // جلب اسم الطفل
        const childRequest = new sql.Request();
        childRequest.input('childId', sql.Int, parseInt(childId));
        const childResult = await childRequest.query(`
            SELECT FullNameArabic FROM tbl_Child WHERE ID_Child = @childId
        `);
        const childName = childResult.recordset[0]?.FullNameArabic || 'طفل';

        const request = new sql.Request();
        request.input('childId', sql.Int, parseInt(childId));

        let query = `
            SELECT 
                i.incomeDate,
                d.incomeAmount,
                d.ReceiptNumber,
                d.date_Pay,
                d.Byan,
                d.Notes,
                ik.incomeKind AS incomeKindName,
                ik.kindGroup
            FROM tbl_incomeDetalis d
            INNER JOIN tbl_income i ON d.IDincome = i.ID
            INNER JOIN tbl_incomeKind ik ON d.incomeKind = ik.ID
            WHERE d.child_ID = @childId
            AND ik.ID NOT IN (36, 51)
        `;

        if (fromDate) {
            query += ` AND i.incomeDate >= @fromDate`;
            request.input('fromDate', sql.DateTime, new Date(fromDate));
        }
        if (toDate) {
            query += ` AND i.incomeDate <= @toDate`;
            request.input('toDate', sql.DateTime, new Date(toDate));
        }

        query += ` ORDER BY i.incomeDate DESC`;

        const result = await request.query(query);

        const totalAmount = result.recordset.reduce((sum, row) => sum + (row.incomeAmount || 0), 0);

        let htmlContent = `
            <html dir="rtl">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    h1 { color: #4CAF50; text-align: center; }
                    h2 { text-align: center; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
                    th { background-color: #4CAF50; color: white; }
                    .total { font-size: 18px; font-weight: bold; margin-top: 20px; text-align: left; }
                    .date-range { text-align: center; margin: 10px 0; color: #666; }
                </style>
            </head>
            <body>
                <h1>كشف حساب الطفل</h1>
                <h2>${childName}</h2>
        `;

        if (fromDate || toDate) {
            htmlContent += `<div class="date-range">الفترة: ${fromDate ? new Date(fromDate).toLocaleDateString('ar-EG') : 'من البداية'} - ${toDate ? new Date(toDate).toLocaleDateString('ar-EG') : 'حتى الآن'}</div>`;
        }

        htmlContent += `
                <table>
                    <tr>
                        <th>التاريخ</th>
                        <th>نوع الإيراد</th>
                        <th>المجموعة</th>
                        <th>البيان</th>
                        <th>رقم الإيصال</th>
                        <th>المبلغ</th>
                    </tr>
        `;

        result.recordset.forEach(row => {
            htmlContent += `
                <tr>
                    <td>${row.incomeDate ? new Date(row.incomeDate).toLocaleDateString('ar-EG') : ''}</td>
                    <td>${row.incomeKindName || ''}</td>
                    <td>${row.kindGroup || ''}</td>
                    <td>${row.Byan || ''}</td>
                    <td>${row.ReceiptNumber || ''}</td>
                    <td>${(row.incomeAmount || 0).toFixed(2)} ج.م</td>
                </tr>
            `;
        });

        htmlContent += `
                </table>
                <div class="total">إجمالي المدفوعات: ${totalAmount.toFixed(2)} ج.م</div>
            </body>
            </html>
        `;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=child_income_${childId}.html`);
        res.send(htmlContent);

    } catch (err) {
        console.error('Error in exportChildIncomesToPDF:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};



module.exports = {
    getIncomesReport,
    getIncomeGroups,
    getIncomeKindsByGroup,
    getChildIncomes,
    getChildrenList,
    exportIncomesToExcel,        
    exportIncomesToPDF,          
    exportChildIncomesToExcel,   
    exportChildIncomesToPDF      
};