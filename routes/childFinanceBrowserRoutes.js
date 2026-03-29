const express = require('express');
const router = express.Router();
const controller = require('../controllers/childFinanceBrowserController');

router.get('/sessions-overview', controller.getSessionsOverview);
router.get('/session-dashboard/:sessionId', controller.getSessionDashboard);
router.get('/session-records/:sessionId', controller.getSessionRecords);

module.exports = router;