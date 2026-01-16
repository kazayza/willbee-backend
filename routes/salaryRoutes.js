const express = require('express');
const router = express.Router();
const controller = require('../controllers/salaryController');

// 1. معاينة الرواتب (GET)
// Example: /api/salaries/preview?month=1&year=2025
router.get('/preview', controller.previewPayroll);

// 2. اعتماد الرواتب (POST)
router.post('/confirm', controller.confirmPayroll);

module.exports = router;