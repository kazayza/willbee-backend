const express = require('express');
const router = express.Router();
const profitLossController = require('../controllers/profitLossController');

// 📊 التقرير التفصيلي الكامل
router.get('/report', profitLossController.getProfitLossReport);

// 📈 ملخص سريع للداشبورد
router.get('/summary', profitLossController.getProfitLossSummary);

// 🔄 مقارنة بين فترتين
router.get('/compare', profitLossController.comparePeriods);

// 📅 التقرير الشهري (Trend)
router.get('/monthly-trend', profitLossController.getMonthlyTrend);

// 🏢 تقرير بالفروع
router.get('/by-branch', profitLossController.getReportByBranch);

module.exports = router;