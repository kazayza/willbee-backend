const express = require('express');
const router = express.Router();
const incomeController = require('../controllers/incomeController');

// عرض الإيرادات
router.get('/', incomeController.getAllIncomes);

// أنواع الإيرادات (Dropdown)
router.get('/kinds', incomeController.getIncomeKinds);

// إضافة إيصال
router.post('/', incomeController.addIncome);

module.exports = router;