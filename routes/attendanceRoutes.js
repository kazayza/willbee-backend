const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');

// حفظ الغياب (POST)
router.post('/', attendanceController.saveAttendance);

// عرض الغياب بتاريخ معين (GET)
// مثال الاستخدام: /api/attendance?date=2025-01-16
router.get('/', attendanceController.getAttendanceByDate);

module.exports = router;