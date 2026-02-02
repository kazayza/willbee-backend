//const express = require('express');
//const router = express.Router();
//const incomeKPIController = require('../controllers/incomeKPIController');

// المؤشرات الرئيسية
//router.get('/main', incomeKPIController.getMainKPIs);

// بيانات الرسم البياني
//router.get('/chart', incomeKPIController.getChartData);

// التوزيع حسب النوع
//router.get('/distribution/kind', incomeKPIController.getDistributionByKind);

// التوزيع حسب الفرع
//router.get('/distribution/branch', incomeKPIController.getDistributionByBranch);

// تحليل الاتجاهات
//router.get('/trends', incomeKPIController.getTrendsAnalysis);

// معدلات النمو
//router.get('/growth', incomeKPIController.getGrowthRates);

// المقارنة التفصيلية
//router.get('/comparison', incomeKPIController.getDetailedComparison);

// الملخص التنفيذي
//router.get('/summary', incomeKPIController.getExecutiveSummary);

//module.exports = router;

//========================
// New
//================
const express = require('express');
const router = express.Router();
const incomeKPIController = require('../controllers/incomeKPIController');
const incomeKPIDashboard = require('../controllers/incomeKPIDashboard');


// ═══════════════════════════════════════════════════════════════
// 🆕 الـ Endpoint الجديد
// ═══════════════════════════════════════════════════════════════
router.get('/dashboard', incomeKPIDashboard.getDashboard);

// ═══════════════════════════════════════════════════════════════
// 📦 الـ Endpoints القديمة
// ═══════════════════════════════════════════════════════════════
router.get('/main', incomeKPIController.getMainKPIs);
router.get('/chart', incomeKPIController.getChartData);
router.get('/distribution/kind', incomeKPIController.getDistributionByKind);
router.get('/distribution/branch', incomeKPIController.getDistributionByBranch);
router.get('/trends', incomeKPIController.getTrendsAnalysis);
router.get('/growth', incomeKPIController.getGrowthRates);
router.get('/comparison', incomeKPIController.getDetailedComparison);
router.get('/summary', incomeKPIController.getExecutiveSummary);
router.get('/filters', incomeKPIDashboard.getFilters);

module.exports = router;