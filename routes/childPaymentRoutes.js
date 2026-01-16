const express = require('express');
const router = express.Router();
const controller = require('../controllers/childPaymentController');

router.post('/', controller.payInstallment);
router.get('/', controller.getRecentPayments);

module.exports = router;