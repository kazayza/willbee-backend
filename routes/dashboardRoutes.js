const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// رابط الإحصائيات
router.get('/', dashboardController.getHomeStats);

module.exports = router;