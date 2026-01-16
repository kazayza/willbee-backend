const express = require('express');
const router = express.Router();
const generalController = require('../controllers/appGeneralController');


// تأكد إن الأسماء دي مطابقة للموجودة في module.exports في الكونترولر
router.get('/sessions', generalController.getSessions);
router.get('/managements', generalController.getManagements);
router.get('/worker-types', generalController.getWorkerTypes);
router.get('/penalty-types', generalController.getPenaltyTypes);
router.get('/eshraf-types', generalController.getEshrafTypes);
router.get('/professions', generalController.getProfessions);
router.get('/company-info', generalController.getCompanyInfo);

module.exports = router;