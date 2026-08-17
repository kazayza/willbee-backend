const express = require('express');
const router = express.Router();
const empController = require('../controllers/employeeController');

// عرض الموظفين (يدعم ?activeOnly=false و ?search=...)
router.get('/', empController.getEmployees);

// الموظفين اللى ليهم يوزرز بس
// GET /api/employees/with-users
router.get('/with-users', empController.getEmployeesWithUsers);

// جلب قائمة الوظائف
// GET /api/employees/jobs
router.get('/jobs', empController.getEmployeeJobs);

// 📊 ملخص الموظفين النشطين + إحصائيات الفروع
// GET /api/employees/active-summary
router.get('/active-summary', empController.getActiveEmployeesSummary);

// إضافة موظف
// POST /api/employees
router.post('/', empController.createEmployee);

// سجل الرواتب لموظف معين
// GET /api/employees/:id/salary
router.get('/:id/salary', empController.getEmployeeSalaryHistory);
router.post('/:id/salary', empController.addEmployeeSalary);
router.delete('/:id/salary/:salaryId', empController.deleteEmployeeSalary);

// جلب موظف واحد بالـ ID
// GET /api/employees/:id
router.get('/:id', empController.getEmployeeById);

// تعديل موظف
// PUT /api/employees/:id
router.put('/:id', empController.updateEmployee);

module.exports = router;