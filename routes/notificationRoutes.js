const express = require('express');
const router = express.Router();
const notifController = require('../controllers/notificationController');

// جلب إشعارات المستخدم
router.get('/:userId', notifController.getMyNotifications);

// تعليم إشعار كمقروء
router.put('/:id/read', notifController.markAsRead);

// تعليم كل الإشعارات كمقروءة
router.put('/:userId/read-all', notifController.markAllAsRead);

// إرسال إشعار عام للجميع (Admin)
router.post('/broadcast', notifController.sendBroadcastNotification);

// إرسال إشعار تحديث التطبيق
router.post('/update', notifController.sendUpdateNotification);

module.exports = router;