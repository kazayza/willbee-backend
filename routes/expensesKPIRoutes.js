const express = require('express');
const router = express.Router();
const controller = require('../controllers/expensesKPIController');

router.get('/dashboard', controller.getExpensesKPI);

module.exports = router;