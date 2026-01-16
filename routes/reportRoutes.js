const express = require('express');
const router = express.Router();
const controller = require('../controllers/reportController');

router.post('/', controller.saveReportConfig);
router.get('/', controller.getSavedReports);

module.exports = router;