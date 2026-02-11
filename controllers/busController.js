const { sql } = require('../config/db');

// جلب خطوط الباص
const getBusLines = async (req, res) => {
    try {
        const result = await sql.query('SELECT ID, BusLine FROM tbl_BusLines ORDER BY ID ASC');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching bus lines', error: err.message });
    }
};

// جلب الأطفال المشتركين في خط باص معين
const getBusLineChildren = async (req, res) => {
    const { busLineId, sessionId } = req.params;

    try {
        const request = new sql.Request();
        request.input('busLineId', sql.SmallInt, busLineId);
        request.input('sessionId', sql.SmallInt, sessionId);

        const result = await request.query(`
            SELECT 
                c.ID_Child,
                c.FullNameArabic,
                c.ResidenceAddress,
                c.MotherName,
                c.MotherMobile1,
                c.MotherMobile2,
                c.FatherMobile1,
                c.FatherMobile2,
                b.branchName,
                bl.[BusLine] as BusLineName
            FROM tbl_FinanceChild f
            INNER JOIN tbl_Child c ON f.Child_Id = c.ID_Child
            LEFT JOIN tbl_Branch b ON c.Branch = b.IDbranch
            LEFT JOIN tbl_BusLines bl ON f.BusLine = bl.ID
            WHERE f.BusLine = @busLineId
              AND f.SessionID = @sessionId
              AND f.Kind_subscrip = N'اشتراك الباص'
              AND (f.withdraw = 0 OR f.withdraw IS NULL)
            ORDER BY c.FullNameArabic ASC
        `);

        res.status(200).json({
            success: true,
            count: result.recordset.length,
            data: result.recordset
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب البيانات',
            error: err.message
        });
    }
};

// إضافة خط باص جديد
const addBusLine = async (req, res) => {
    const { busLine } = req.body;

    if (!busLine || busLine.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'اسم الخط مطلوب'
        });
    }

    try {
        const request = new sql.Request();
        request.input('busLine', sql.NVarChar, busLine.trim());

        // التحقق من عدم التكرار
        const checkResult = await request.query(`
            SELECT ID FROM tbl_BusLines WHERE BusLine = @busLine
        `);

        if (checkResult.recordset.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'هذا الخط موجود بالفعل'
            });
        }

        const result = await request.query(`
            INSERT INTO tbl_BusLines (BusLine)
            OUTPUT inserted.ID
            VALUES (@busLine)
        `);

        res.status(201).json({
            success: true,
            message: 'تم إضافة الخط بنجاح ✅',
            id: result.recordset[0].ID
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'فشل إضافة الخط',
            error: err.message
        });
    }
};

// تعديل خط باص
const updateBusLine = async (req, res) => {
    const { id } = req.params;
    const { busLine } = req.body;

    if (!busLine || busLine.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'اسم الخط مطلوب'
        });
    }

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('busLine', sql.NVarChar, busLine.trim());

        // التحقق من عدم التكرار
        const checkResult = await request.query(`
            SELECT ID FROM tbl_BusLines WHERE BusLine = @busLine AND ID != @id
        `);

        if (checkResult.recordset.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'هذا الاسم موجود بالفعل لخط آخر'
            });
        }

        const result = await request.query(`
            UPDATE tbl_BusLines SET BusLine = @busLine WHERE ID = @id
        `);

        if (result.rowsAffected[0] > 0) {
            res.status(200).json({
                success: true,
                message: 'تم تعديل الخط بنجاح ✅'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'الخط غير موجود'
            });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'فشل تعديل الخط',
            error: err.message
        });
    }
};

module.exports = {
    getBusLines,
    getBusLineChildren,
    addBusLine,
    updateBusLine
};