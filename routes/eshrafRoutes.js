const express = require('express');
const router = express.Router();
const eshrafController = require('../controllers/eshrafController');

// إضافة جزاء/مكافأة
router.post('/', eshrafController.addPenalty);

// 🆕 تسجيل سلفة مع أقساط (لازم قبل /:id)
router.post('/loan', eshrafController.addLoanWithInstallments);

// بحث متقدم (لازم قبل /:id)
router.get('/search', eshrafController.searchEshraf);

// عرض جزاءات موظف
router.get('/:id', eshrafController.getEmployeePenalties);

// تعديل
router.put('/:id', eshrafController.updatePenalty);

// حذف
router.delete('/:id', eshrafController.deletePenalty);

module.exports = router;