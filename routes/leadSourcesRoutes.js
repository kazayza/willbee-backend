const express = require('express');
const router = express.Router();
const {
    getSources,
    getAllSources,
    createSource,
    updateSource,
    deleteSource,
    toggleSourceStatus
} = require('../controllers/leadSourcesController');

// ✅ جلب المصادر النشطة فقط (للـ Dropdowns)
router.get('/', getSources);

// ✅ جلب كل المصادر (للإدارة)
router.get('/all', getAllSources);

// ✅ إضافة مصدر جديد
router.post('/', createSource);

// ✅ تعديل مصدر
router.put('/:id', updateSource);

// ✅ حذف مصدر (Soft Delete)
router.delete('/:id', deleteSource);

// ✅ تفعيل/إلغاء تفعيل مصدر
router.patch('/:id/toggle', toggleSourceStatus);

module.exports = router;