const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');

// ================== GET REQUESTS ==================

// لوحة تحكم الفصول
// GET /api/classes/dashboard?branchId=1
router.get('/dashboard', classController.getClassesDashboard);

// جلب الأطفال غير المسكنين
// GET /api/classes/unassigned?branchId=1
router.get('/unassigned', classController.getUnassignedChildren);

// جلب فصل واحد 🆕
// GET /api/classes/:id
router.get('/:id', classController.getClassById);


// ================== POST REQUESTS ==================

// إضافة فصل جديد
// POST /api/classes
router.post('/', classController.addClass);

// توزيع ونقل الطلاب
// POST /api/classes/assign-student
router.post('/assign-student', classController.assignStudent);

// تعيين مدرس لفصل
// POST /api/classes/assign-teacher
router.post('/assign-teacher', classController.addTeacherToClass);


// ================== PUT REQUESTS ==================

// تعديل بيانات فصل
// PUT /api/classes/:id
router.put('/:id', classController.updateClass);


// ================== PATCH REQUESTS ==================

// إلغاء تكليف مدرس (بدل POST)
// PATCH /api/classes/teacher/:assignId/deactivate
router.patch('/teacher/:assignId/deactivate', (req, res) => {
    req.body.assignId = req.params.assignId; // نقل الـ ID للـ body
    classController.removeTeacherFromClass(req, res);
});

module.exports = router;