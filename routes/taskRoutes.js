const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');

// إنشاء مهمة
router.post('/', taskController.createTask);

// عرض مهام موظف (ممكن نستخدم ?status=Pending)
router.get('/employee/:empId', taskController.getMyTasks);

// تحديث حالة مهمة
router.put('/:taskId/status', taskController.updateTaskStatus);

module.exports = router;