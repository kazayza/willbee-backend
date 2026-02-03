const express = require('express');
const router = express.Router();


const { 
    createTask, 
    getMyTasks, 
    updateTaskStatus, 
    deleteTask,
    getLeadTasksCount  
} = require('../controllers/taskController');

// إنشاء مهمة جديدة
// POST /api/tasks
router.post('/', createTask);

// ✅ مهم: حط المسار ده قبل المسار العام /:empId
// جلب عدد مهام Lead معين
// GET /api/tasks/lead/:leadId/count
router.get('/lead/:leadId/count', getLeadTasksCount);

// عرض مهام موظف معيّن (مع فلتر status اختياري)
// GET /api/tasks/:empId?status=Pending
router.get('/:empId', getMyTasks);

// جلب المهام التي أرسلتها
router.get('/sent-by/:userId', getTasksSentByMe);

// تحديث حالة مهمة
// PUT /api/tasks/:taskId/status
router.put('/:taskId/status', updateTaskStatus);

// حذف مهمة
// DELETE /api/tasks/:taskId
router.delete('/:taskId', deleteTask);

module.exports = router;