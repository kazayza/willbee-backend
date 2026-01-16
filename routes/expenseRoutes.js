const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');

// 1. عرض الكل
router.get('/', expenseController.getAllExpenses);

// 2. جلب الأنواع (Dropdown)
router.get('/kinds', expenseController.getExpenseKinds);

// 3. جلب الفروع (Dropdown) - جديد
router.get('/branches', expenseController.getBranches);

// 4. إضافة مصروف
router.post('/', expenseController.addExpense);

module.exports = router;