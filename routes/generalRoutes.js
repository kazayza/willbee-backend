const express = require('express');
const router = express.Router();
// تأكد إن المسار ده صح (نقطتين .. عشان نرجع خطوة لورا)
const generalController = require('../controllers/generalController');

// المسارات
router.get('/sessions', generalController.getSessions);
router.get('/managements', generalController.getManagements);
router.get('/worker-types', generalController.getWorkerTypes);

router.get('/professions', generalController.getProfessions);
router.get('/company-info', generalController.getCompanyInfo);

// أنواع بنود الإشراف (جزاءات ومكافآت)
router.get('/eshraf-types', generalController.getEshrafTypes);

module.exports = router;