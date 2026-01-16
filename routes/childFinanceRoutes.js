const express = require('express');
const router = express.Router();
const financeController = require('../controllers/childFinanceController');

// حفظ/تحديث اشتراك طفل
router.post('/', financeController.setChildSubscription);

// جلب اشتراك طفل (بالـ ID بتاع الطفل)
router.get('/:id', financeController.getChildSubscription);

module.exports = router;