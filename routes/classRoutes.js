const express = require('express');
const router = express.Router();
const classController = require('../controllers/classController');

// ================== GET ==================

router.get('/dashboard', classController.getClassesDashboard);
router.get('/unassigned', classController.getUnassignedChildren);
router.get('/:id', classController.getClassById);

// ================== POST ==================

router.post('/', classController.addClass);
router.post('/assign-student', classController.assignStudent);
router.post('/assign-teacher', classController.addTeacherToClass);

// ================== PUT ==================

router.put('/:id', classController.updateClass);

// ================== PATCH ==================

router.patch('/teacher/:assignId/deactivate', classController.removeTeacherFromClass);

module.exports = router;