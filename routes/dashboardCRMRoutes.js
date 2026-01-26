const express = require('express');
const router = express.Router();
const dashboardCRMController = require('../controllers/dashboardCRMController');

// ملخص الـ CRM Dashboard الرئيسي
router.get('/summary', dashboardCRMController.getCRMDashboardSummary);

// أداء المصادر
router.get('/sources-performance', dashboardCRMController.getCRMSourcesPerformance);

// أداء الموظفين
router.get('/employees-performance', dashboardCRMController.getCRMEmployeesPerformance);

// إحصائيات حسب الفترة
router.get('/leads-by-period', dashboardCRMController.getCRMLeadsByPeriod);

// أداء الفروع
router.get('/branches-performance', dashboardCRMController.getCRMBranchesPerformance);

// إحصائيات سريعة
router.get('/quick-stats', dashboardCRMController.getCRMQuickStats);

// تقرير التحويلات
router.get('/conversions-report', dashboardCRMController.getCRMConversionsReport);

module.exports = router;