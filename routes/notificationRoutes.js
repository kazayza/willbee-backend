const express = require('express');
const router = express.Router();
const notifController = require('../controllers/notificationController');

router.get('/:userId', notifController.getMyNotifications);
router.put('/:id/read', notifController.markAsRead);

// مسار تجريبي
router.post('/send-test', notifController.testSendNotification);

module.exports = router;