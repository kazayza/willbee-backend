const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/incomeController');

// ═══════════════════════════════════════════════════════════════
// عرض وفلترة الإيرادات
// ═══════════════════════════════════════════════════════════════
router.get('/', incomeController.getAllIncomes);
router.get('/filter', incomeController.filterIncomes);
router.get('/:id', incomeController.getIncomeById);

// ═══════════════════════════════════════════════════════════════
// أنواع الإيرادات (Dropdown)
// ═══════════════════════════════════════════════════════════════
router.get('/kinds/all', incomeController.getIncomeKinds);

// ═══════════════════════════════════════════════════════════════
// بيانات اشتراك طفل
// ═══════════════════════════════════════════════════════════════
router.get('/subscription/:childId/:sessionId', incomeController.getChildSubscriptionDetails);

// ═══════════════════════════════════════════════════════════════
// إضافة إيراد
// ═══════════════════════════════════════════════════════════════
router.post('/subscription', incomeController.addSubscriptionPayment);
router.post('/general', incomeController.addGeneralIncome);

// ═══════════════════════════════════════════════════════════════
// تعديل وحذف إيراد
// ═══════════════════════════════════════════════════════════════
router.put('/:id', incomeController.updateIncome);
router.delete('/:id', incomeController.deleteIncome);

module.exports = router;