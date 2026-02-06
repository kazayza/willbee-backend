const express = require('express');
const router = express.Router();
const { getExpensesKPI, getExpenseFilters } = require('../controllers/expensesKPIController');

// مؤشرات أداء المصروفات
router.get('/kpi', getExpensesKPI);

// الفلاتر المتاحة
router.get('/filters', getExpenseFilters);

module.exports = router;