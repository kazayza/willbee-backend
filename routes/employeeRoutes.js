const express = require('express');
const router = express.Router();
const empController = require('../controllers/employeeController');

// عرض الموظفين (يدعم ?activeOnly=false و ?search=...)
router.get('/', empController.getEmployees);

// إضافة موظف
router.post('/', empController.createEmployee);

// سجل الرواتب لموظف معين
router.get('/:id/salary', empController.getEmployeeSalaryHistory);

// جلب قائمة الوظائف
router.get('/jobs', empController.getEmployeeJobs);
router.get('/:id', empController.getEmployeeById);
router.put('/:id', empController.updateEmployee);

module.exports = router;