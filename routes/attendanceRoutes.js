const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');

// 1. حفظ الغياب
router.post('/save', attendanceController.saveAbsenceList);

// 2. تقرير الغياب اليومي
router.get('/report', attendanceController.getAbsenceReport);

// 3. جلب طلاب الفصل (مع حالة الغياب)
// الرابط: /api/absence/class-students?classId=5&date=2023-10-25
router.get('/class-students', attendanceController.getStudentsForAttendance);

// 4. سجل غياب طفل معين
// الرابط: /api/absence/history/101
router.get('/history/:childId', attendanceController.getChildAbsenceHistory);

module.exports = router;