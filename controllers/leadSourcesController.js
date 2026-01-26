const { sql } = require('../config/db');

// ✅ 1. جلب كل المصادر النشطة
const getSources = async (req, res) => {
    try {
        const request = new sql.Request();
        
        const result = await request.query(`
            SELECT 
                SourceID,
                SourceName,
                SourceIcon,
                SourceColor,
                SortOrder
            FROM tbl_LeadSources 
            WHERE IsDeleted = 0 AND IsActive = 1
            ORDER BY SortOrder ASC
        `);
        
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('getSources error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 2. جلب كل المصادر (للإدارة - يشمل غير النشطة)
const getAllSources = async (req, res) => {
    try {
        const request = new sql.Request();
        
        const result = await request.query(`
            SELECT 
                SourceID,
                SourceName,
                SourceIcon,
                SourceColor,
                IsActive,
                SortOrder,
                CreatedAt
            FROM tbl_LeadSources 
            WHERE IsDeleted = 0
            ORDER BY SortOrder ASC
        `);
        
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('getAllSources error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 3. إضافة مصدر جديد
const createSource = async (req, res) => {
    const { sourceName, sourceIcon, sourceColor, sortOrder, clientTime } = req.body;

    if (!sourceName || sourceName.trim() === '') {
        return res.status(400).json({ message: 'اسم المصدر مطلوب' });
    }

    try {
        const request = new sql.Request();
        request.input('name', sql.NVarChar, sourceName.trim());
        request.input('icon', sql.NVarChar, sourceIcon || null);
        request.input('color', sql.NVarChar, sourceColor || null);
        request.input('sort', sql.Int, sortOrder || 0);
        request.input('clientTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        await request.query(`
            INSERT INTO tbl_LeadSources 
            (SourceName, SourceIcon, SourceColor, SortOrder, IsActive, CreatedAt, IsDeleted)
            VALUES 
            (@name, @icon, @color, @sort, 1, @clientTime, 0)
        `);

        res.status(201).json({ message: 'تم إضافة المصدر بنجاح ✅' });
    } catch (err) {
        console.error('createSource error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 4. تعديل مصدر
const updateSource = async (req, res) => {
    const { id } = req.params;
    const { sourceName, sourceIcon, sourceColor, sortOrder, isActive, clientTime } = req.body;

    if (!sourceName || sourceName.trim() === '') {
        return res.status(400).json({ message: 'اسم المصدر مطلوب' });
    }

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('name', sql.NVarChar, sourceName.trim());
        request.input('icon', sql.NVarChar, sourceIcon || null);
        request.input('color', sql.NVarChar, sourceColor || null);
        request.input('sort', sql.Int, sortOrder || 0);
        request.input('active', sql.Bit, isActive !== undefined ? isActive : true);
        request.input('clientTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            UPDATE tbl_LeadSources 
            SET SourceName = @name,
                SourceIcon = @icon,
                SourceColor = @color,
                SortOrder = @sort,
                IsActive = @active,
                UpdatedAt = @clientTime
            WHERE SourceID = @id AND IsDeleted = 0
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'المصدر غير موجود' });
        }

        res.status(200).json({ message: 'تم تعديل المصدر بنجاح ✅' });
    } catch (err) {
        console.error('updateSource error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 5. حذف مصدر (Soft Delete)
const deleteSource = async (req, res) => {
    const { id } = req.params;
    const { clientTime } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('clientTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            UPDATE tbl_LeadSources 
            SET IsDeleted = 1,
                UpdatedAt = @clientTime
            WHERE SourceID = @id
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'المصدر غير موجود' });
        }

        res.status(200).json({ message: 'تم حذف المصدر بنجاح ✅' });
    } catch (err) {
        console.error('deleteSource error:', err);
        res.status(500).json({ error: err.message });
    }
};

// ✅ 6. تفعيل/إلغاء تفعيل مصدر
const toggleSourceStatus = async (req, res) => {
    const { id } = req.params;
    const { clientTime } = req.body;

    try {
        const request = new sql.Request();
        request.input('id', sql.Int, id);
        request.input('clientTime', sql.DateTime, clientTime ? new Date(clientTime) : new Date());

        const result = await request.query(`
            UPDATE tbl_LeadSources 
            SET IsActive = CASE WHEN IsActive = 1 THEN 0 ELSE 1 END,
                UpdatedAt = @clientTime
            WHERE SourceID = @id AND IsDeleted = 0
        `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: 'المصدر غير موجود' });
        }

        res.status(200).json({ message: 'تم تغيير حالة المصدر بنجاح ✅' });
    } catch (err) {
        console.error('toggleSourceStatus error:', err);
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getSources,
    getAllSources,
    createSource,
    updateSource,
    deleteSource,
    toggleSourceStatus
};