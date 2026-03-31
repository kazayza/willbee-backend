// routes/reportRoutes.js
const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportIncomeKindController');

// =============================================
// تقارير الإيرادات
// =============================================

// الشاشة الأولى: تقرير الإيرادات (مع فلترة)
router.get('/incomes-report', reportController.getIncomesReport);

// جلب مجموعات الإيراد (للفلتر)
router.get('/income-groups', reportController.getIncomeGroups);

// جلب أنواع الإيراد حسب المجموعة
router.get('/income-kinds-by-group', reportController.getIncomeKindsByGroup);

// الشاشة الثانية: إيرادات طفل محدد
router.get('/child-incomes', reportController.getChildIncomes);

// جلب قائمة الأطفال (للبحث)
router.get('/children-list', reportController.getChildrenList);

// تصدير التقارير
router.get('/export-excel', reportController.exportIncomesToExcel);
router.get('/export-pdf', reportController.exportIncomesToPDF);
router.get('/export-child-excel', reportController.exportChildIncomesToExcel);
router.get('/export-child-pdf', reportController.exportChildIncomesToPDF);

module.exports = router;