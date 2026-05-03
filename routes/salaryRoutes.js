const express = require('express');
const router = express.Router();
const controller = require('../controllers/salaryController');

// ✅ 1. جلب الرواتب (ذكي: أرشيف أو حساب جديد + حفظ تلقائي)
// GET /api/salaries/fetch?month=1&year=2025&branchId=1&workerTypeId=2
router.get('/fetch', controller.fetchPayroll);
router.get('/range', controller.fetchPayrollRange);

// ✅ 2. حفظ التعديلات اليدوية (مسودة)
// PUT /api/salaries/draft
router.put('/draft', controller.updateDraft);

// ✅ 3. اعتماد الرواتب (نهائي)
// POST /api/salaries/approve
router.post('/approve', controller.approvePayroll);

module.exports = router;