const express = require('express');
const router = express.Router();

const { 
    createTask, 
    getMyTasks, 
    getTasksSentByMe,
    updateTaskStatus, 
    deleteTask, 
    getLeadTasksCount,
    addTaskReply,
    getTaskReplies,
    markTaskAsRead
} = require('../controllers/taskController');

// ═══════════════════════════════════════════════════════════════════════════
// 🔹 المسارات المحددة أولاً (Specific Routes)
// ═══════════════════════════════════════════════════════════════════════════

// إنشاء مهمة جديدة
// POST /api/tasks
router.post('/', createTask);

// جلب عدد مهام Lead معين
// GET /api/tasks/lead/:leadId/count
router.get('/lead/:leadId/count', getLeadTasksCount);

// جلب المهام التي أرسلتها
// GET /api/tasks/sent-by/:userId
router.get('/sent-by/:userId', getTasksSentByMe);

// ═══════════════════════════════════════════════════════════════════════════
// 🔹 مسارات الردود والقراءة (Task Replies & Read)
// ═══════════════════════════════════════════════════════════════════════════

// إضافة رد على مهمة
// POST /api/tasks/:taskId/replies
router.post('/:taskId/replies', addTaskReply);

// جلب ردود مهمة
// GET /api/tasks/:taskId/replies
router.get('/:taskId/replies', getTaskReplies);

// تعليم المهمة كمقروءة
// PUT /api/tasks/:taskId/read
router.put('/:taskId/read', markTaskAsRead);

// تحديث حالة مهمة
// PUT /api/tasks/:taskId/status
router.put('/:taskId/status', updateTaskStatus);

// حذف مهمة
// DELETE /api/tasks/:taskId
router.delete('/:taskId', deleteTask);

// ═══════════════════════════════════════════════════════════════════════════
// 🔹 المسارات العامة أخيراً (General Routes)
// ═══════════════════════════════════════════════════════════════════════════

// عرض مهام موظف معيّن (مع فلتر status اختياري)
// GET /api/tasks/:empId?status=Pending
router.get('/:empId', getMyTasks);

module.exports = router;