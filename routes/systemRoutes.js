const express = require('express');
const router = express.Router();
const controller = require('../controllers/systemController');

router.get('/audit-logs', controller.getAuditLogs);
router.post('/audit-logs', controller.logAction); // لتسجيل حركة
router.get('/forms', controller.getFormNames); // أسماء الشاشات

// 🆕 الإدارات مع عدد الموظفين النشطين
router.get('/managements', controller.getManagementsWithCount);

// 🆕 إرسال إشعار حسب الصلاحية
router.post('/notify-by-role', controller.sendNotificationByRole);

// 🆕 جلب كل المستخدمين (لشاشة الإشعارات)
router.get('/notification-users', controller.getAllUsersForNotification);

module.exports = router;