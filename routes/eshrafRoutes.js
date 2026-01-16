const express = require('express');
const router = express.Router();
const eshrafController = require('../controllers/eshrafController');

// إضافة جزاء
router.post('/', eshrafController.addPenalty);

// عرض جزاءات موظف
router.get('/:id', eshrafController.getEmployeePenalties);

module.exports = router;