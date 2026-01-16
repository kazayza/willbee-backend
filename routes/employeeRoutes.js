const express = require('express');
const router = express.Router();
const empController = require('../controllers/employeeController');

// عرض الكل أو البحث
router.get('/', empController.getEmployees);

// إضافة موظف
router.post('/', empController.createEmployee);

module.exports = router;