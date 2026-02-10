const express = require('express');
const router = express.Router();
const debtController = require('../controllers/debtController');

// جلب مديونيات كل الأطفال حسب العام المالي
router.get('/all/:sessionId', debtController.getAllDebts);

// جلب تفاصيل مديونية طفل واحد
router.get('/child/:childId/:sessionId', debtController.getChildDebtDetails);

// فحص الأقساط المتأخرة وإرسال إشعارات
router.get('/check-overdue', debtController.checkOverdueInstallments);

// مؤشرات الأداء المالي
router.get('/kpi/:sessionId', debtController.getFinancialKPIs);

// مؤشرات الأداء المتقدمة
router.get('/advanced-kpi/:sessionId', debtController.getAdvancedKPIs);

module.exports = router;