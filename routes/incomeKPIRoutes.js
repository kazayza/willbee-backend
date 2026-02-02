const express = require('express');
const router = express.Router();
const incomeKPIController = require('../controllers/incomeKPIController');

// المؤشرات الرئيسية
router.get('/main', incomeKPIController.getMainKPIs);

// بيانات الرسم البياني
router.get('/chart', incomeKPIController.getChartData);

// التوزيع حسب النوع
router.get('/distribution/kind', incomeKPIController.getDistributionByKind);

// التوزيع حسب الفرع
router.get('/distribution/branch', incomeKPIController.getDistributionByBranch);

// تحليل الاتجاهات
router.get('/trends', incomeKPIController.getTrendsAnalysis);

// معدلات النمو
router.get('/growth', incomeKPIController.getGrowthRates);

// المقارنة التفصيلية
router.get('/comparison', incomeKPIController.getDetailedComparison);

// الملخص التنفيذي
router.get('/summary', incomeKPIController.getExecutiveSummary);

module.exports = router;