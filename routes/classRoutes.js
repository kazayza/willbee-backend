const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');

// ================== GET ==================

// لوحة تحكم الفصول
router.get('/dashboard', classController.getClassesDashboard);

// جلب قائمة أنواع الأنشطة (دراسة + أنشطة) 🆕
router.get('/activities', classController.getClassActivities);

// جلب الأطفال غير المسكنين
router.get('/unassigned', classController.getUnassignedChildren);

// جلب أطفال فصل معين (المسكنين حالياً) 🆕
router.get('/:classId/children', classController.getClassChildren);

// جلب سجل الفصل (الأطفال السابقين) 🆕
router.get('/:classId/history', classController.getClassHistory);

// جلب الفصول المتاحة للنقل 🆕
router.get('/:classId/available-for-transfer', classController.getAvailableClassesForTransfer);

router.get('/:classId/statistics', classController.getClassStatistics);

// جلب فصل واحد
router.get('/:id', classController.getClassById);

// ================== POST ==================

// إضافة فصل جديد
router.post('/', classController.addClass);

// توزيع طالب جديد
router.post('/assign-student', classController.assignStudent);

// إفراغ الفصول (أرشفة) 🆕
router.post('/archive', classController.archiveClasses);

// نقل طالب بين الفصول 🆕
router.post('/transfer-student', classController.transferStudent);

// تعيين مدرس لفصل
router.post('/assign-teacher', classController.addTeacherToClass);

// ================== PUT ==================

// تعديل بيانات فصل
router.put('/:id', classController.updateClass);

// ================== PATCH ==================

// إلغاء تكليف مدرس
router.patch('/teacher/:assignId/deactivate', classController.removeTeacherFromClass);

// ================== DELETE ==================

// إخراج طفل من الفصل 🆕
router.delete('/student/:historyId', classController.removeStudentFromClass);

module.exports = router;