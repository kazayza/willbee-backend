const express = require('express');
const router = express.Router();
const childPaymentController = require('../controllers/childPaymentController');

// ═══════════════════════════════════════════════════════════════
// Routes الأقساط
// ═══════════════════════════════════════════════════════════════

// إنشاء أقساط جديدة لاشتراك معين
router.post('/installments', childPaymentController.createInstallments);

// جلب أقساط اشتراك معين
router.get('/installments/:financeId', childPaymentController.getInstallmentsByFinanceId);

// تعديل قسط معين
router.put('/installments/:id', childPaymentController.updateInstallment);

// حذف قسط معين
router.delete('/installments/:id', childPaymentController.deleteInstallment);

// حذف كل أقساط اشتراك معين
router.delete('/installments/finance/:financeId', childPaymentController.deleteAllInstallments);

// تسجيل دفع قسط (تحديث حالة القسط لـ "مدفوع")
router.put('/pay/:id', childPaymentController.payInstallment);

// جلب آخر المدفوعات
router.get('/recent', childPaymentController.getRecentPayments);

module.exports = router;