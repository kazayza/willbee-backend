const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

// جلب الـ Leads اللي محتاجين متابعة
router.get('/need-followup', leadController.getLeadsNeedFollowUp);

// جلب متابعات اليوم
router.get('/today-followups', leadController.getTodayFollowUps);

// عرض كل الـ Leads
router.get('/', leadController.getLeads);

// جلب Lead واحد
router.get('/:id', leadController.getLeadById);

// إضافة Lead جديد
router.post('/', leadController.createLead);

// تحويل Lead لـ Customer
router.post('/:leadId/convert', leadController.convertLeadToCustomer);

// تعديل Lead كامل
router.put('/:id', leadController.updateLead);

// تحديث حالة Lead فقط
router.put('/:id/status', leadController.updateLeadStatus);

// حذف Lead
router.delete('/:id', leadController.deleteLead);

module.exports = router;