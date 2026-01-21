const express = require('express');
const router = express.Router();
const { createTask, getMyTasks, updateTaskStatus, deleteTask } = require('../controllers/taskController');

// إنشاء مهمة جديدة
// POST /api/tasks
router.post('/', createTask);

// عرض مهام موظف معيّن (مع فلتر status اختياري)
// GET /api/tasks/:empId?status=Pending
router.get('/:empId', getMyTasks);

// تحديث حالة مهمة
// PUT /api/tasks/:taskId/status
router.put('/:taskId/status', updateTaskStatus);

// حذف مهمة ✅ جديد
// DELETE /api/tasks/:taskId
router.delete('/:taskId', deleteTask);

module.exports = router;