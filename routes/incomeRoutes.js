const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/incomeController');

// ═══════════════════════════════════════════════════════════════
// عرض الإيرادات
// ═══════════════════════════════════════════════════════════════
router.get('/', incomeController.getAllIncomes);

// ═══════════════════════════════════════════════════════════════
// أنواع الإيرادات (Dropdown)
// ═══════════════════════════════════════════════════════════════
router.get('/kinds', incomeController.getIncomeKinds);

// ═══════════════════════════════════════════════════════════════
// بيانات اشتراك طفل مع الأقساط والمدفوعات
// ═══════════════════════════════════════════════════════════════
router.get('/subscription/:childId/:sessionId', incomeController.getChildSubscriptionDetails);

// ═══════════════════════════════════════════════════════════════
// إضافة إيصال عادي
// ═══════════════════════════════════════════════════════════════
router.post('/', incomeController.addIncome);

// ═══════════════════════════════════════════════════════════════
// تحصيل اشتراك دراسة (مع تحديث القسط)
// ═══════════════════════════════════════════════════════════════
router.post('/subscription', incomeController.addSubscriptionPayment);

module.exports = router;