const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/incomeController');

// ═══════════════════════════════════════════════════════════════
// 1. الـ Routes الثابتة (لازم تيجي الأول)
// ═══════════════════════════════════════════════════════════════

// عرض الإيرادات
router.get('/', incomeController.getAllIncomes);

// فلترة الإيرادات
router.get('/filter', incomeController.filterIncomes);

// أنواع الإيرادات (كانت بتضرب Error عشان مكانها كان غلط)
router.get('/kinds', incomeController.getIncomeKinds); // رجعتها kinds بس عشان متلخبطش الـ Flutter
router.get('/kinds/all', incomeController.getIncomeKinds); // احتياطي لو بتستخدم ده

// بيانات اشتراك طفل
router.get('/subscription/:childId/:sessionId/:type', incomeController.getChildSubscriptionDetails);

// ═══════════════════════════════════════════════════════════════
// 2. الـ Routes المتغيرة (تيجي في الآخر)
// ═══════════════════════════════════════════════════════════════

// جلب إيراد واحد بالـ ID (ده اللي كان عامل المشكلة)
router.get('/:id', incomeController.getIncomeById);

// ═══════════════════════════════════════════════════════════════
// 3. أوامر الكتابة (POST, PUT, DELETE)
// ═══════════════════════════════════════════════════════════════

// إضافة إيراد عادي
router.post('/', incomeController.addIncome);

// تحصيل اشتراك دراسة
router.post('/subscription', incomeController.addSubscriptionPayment);

// تحصيل إيراد عام
router.post('/general', incomeController.addGeneralIncome);

// تعديل وحذف إيراد
router.put('/:id', incomeController.updateIncome);
router.delete('/:id', incomeController.deleteIncome);

module.exports = router;