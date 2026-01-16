const express = require('express');
const router = express.Router();
const controller = require('../controllers/systemController');

router.get('/audit-logs', controller.getAuditLogs);
router.post('/audit-logs', controller.logAction); // لتسجيل حركة
router.get('/forms', controller.getFormNames); // أسماء الشاشات

module.exports = router;