const express = require('express');
const router = express.Router();
const {
    getLeadSourceAnalytics,
    getCampaignAnalytics,
    getDashboardKPIs,
    getEmployeePerformance
} = require('../controllers/analyticsController');

// ✅ تحليل المصادر
router.get('/sources', getLeadSourceAnalytics);

// ✅ تحليل الحملات
router.get('/campaigns', getCampaignAnalytics);

// ✅ ملخص لوحة التحكم
router.get('/kpi', getDashboardKPIs);

// ✅ أداء الموظفين
router.get('/employees', getEmployeePerformance);

module.exports = router;