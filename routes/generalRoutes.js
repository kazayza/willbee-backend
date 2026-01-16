const express = require('express');
const router = express.Router();

// ✅ لاحظ: بننادي على الملف الجديد (appGeneralController)
const generalController = require('../controllers/appGeneralController');

router.get('/sessions', generalController.getSessions);
router.get('/managements', generalController.getManagements);
router.get('/worker-types', generalController.getWorkerTypes);
router.get('/penalty-types', generalController.getPenaltyTypes);
router.get('/eshraf-types', generalController.getEshrafTypes);
router.get('/professions', generalController.getProfessions);
router.get('/company-info', generalController.getCompanyInfo);

module.exports = router;