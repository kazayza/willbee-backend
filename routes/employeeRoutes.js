const express = require('express');
const router = express.Router();
const empController = require('../controllers/employeeController');

// عرض الموظفين (يدعم ?activeOnly=false و ?search=...)
router.get('/', empController.getEmployees);

// إضافة موظف
router.post('/', empController.createEmployee);

// سجل الرواتب لموظف معين
router.get('/:id/salary', empController.getEmployeeSalaryHistory);

//وظائف الموظفين
router.get('/:id/salary', empController.getEmployeeJobs);

module.exports = router;