const express = require('express');
const router = express.Router();
const controller = require('../controllers/financialSettingsController');

// إيرادات
router.get('/income-kinds', controller.getIncomeKinds);
router.post('/income-kinds', controller.addIncomeKind);
router.put('/income-kinds/:id', controller.updateIncomeKind);
router.delete('/income-kinds/:id', controller.deleteIncomeKind);

// مصروفات
router.get('/expense-kinds', controller.getExpenseKinds);
router.post('/expense-kinds', controller.addExpenseKind);
router.put('/expense-kinds/:id', controller.updateExpenseKind);
router.delete('/expense-kinds/:id', controller.deleteExpenseKind);

module.exports = router;