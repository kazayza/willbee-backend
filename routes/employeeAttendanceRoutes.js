const express = require('express');
const router = express.Router();
const controller = require('../controllers/employeeAttendanceController');

// حفظ الغياب
router.post('/', controller.saveEmpAttendance);

// عرض الغياب
router.get('/', controller.getEmpAttendanceByDate);

// ✅ حذف غياب (موظف واحد أو كل اليوم)
router.delete('/', controller.deleteEmpAttendance);

module.exports = router;