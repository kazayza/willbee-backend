const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

// إضافة Lead
router.post('/', leadController.createLead);

// عرض Leads
router.get('/', leadController.getLeads);

// تحويل Lead لعميل
router.post('/:leadId/convert', leadController.convertLeadToCustomer);

module.exports = router;