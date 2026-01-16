const express = require('express');
const router = express.Router();
const controller = require('../controllers/employeeAttendanceController');

// حفظ الغياب
router.post('/', controller.saveEmpAttendance);

// عرض الغياب
router.get('/', controller.getEmpAttendanceByDate);

module.exports = router;