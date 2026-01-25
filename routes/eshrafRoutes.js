const express = require('express');
const router = express.Router();
const eshrafController = require('../controllers/eshrafController');

// إضافة جزاء
router.post('/', eshrafController.addPenalty);

// بحث متقدم (لازم يكون قبل /:id)
router.get('/search', eshrafController.searchEshraf);

// عرض جزاءات موظف
router.get('/:id', eshrafController.getEmployeePenalties);

// ✅ تعديل (جديد)
router.put('/:id', eshrafController.updatePenalty);

// ✅ حذف (جديد)
router.delete('/:id', eshrafController.deletePenalty);

module.exports = router;