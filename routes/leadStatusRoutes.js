const express = require('express');
const router = express.Router();
const { 
    getLeadStatuses, 
    updateLeadStatus 
} = require('../controllers/leadStatusController');

// جلب كل الحالات
router.get('/', getLeadStatuses);

// تحديث حالة Lead
router.patch('/leads/:id', updateLeadStatus);

module.exports = router;