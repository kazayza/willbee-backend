const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController'); // تأكد إن ده اسم ملف الكنترولر الصح

// 1. حفظ الغياب
// استخدمنا saveAbsenceList عشان ده الاسم اللي أنت مصدره
router.post('/save', attendanceController.saveAbsenceList); 

// 2. عرض الغياب
// استخدمنا getAbsenceReport عشان ده الاسم اللي أنت مصدره
router.get('/report', attendanceController.getAbsenceReport);

module.exports = router;