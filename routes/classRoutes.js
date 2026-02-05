// routes/classRoutes.js
const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');

// 1. لوحة تحكم الفصول (Dashboard)
// الرابط هيكون: /api/classes/dashboard?branchId=1
router.get('/dashboard', classController.getClassesDashboard);

// 2. توزيع ونقل الطلاب
// الرابط: /api/classes/assign-student (POST)
router.post('/assign-student', classController.assignStudent);

// 3. إدارة المدرسين في الفصول
// الرابط: /api/classes/assign-teacher (POST)
router.post('/assign-teacher', classController.addTeacherToClass);

// الرابط: /api/classes/remove-teacher (POST)
router.post('/remove-teacher', classController.removeTeacherFromClass);

// 4. جلب الأطفال غير المسكنين (للتسهيل)
// الرابط: /api/classes/unassigned?branchId=1
router.get('/unassigned', classController.getUnassignedChildren);

// إضافة فصل جديد
router.post('/add', classController.addClass);

module.exports = router;