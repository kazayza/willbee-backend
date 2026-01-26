const express = require('express');
const router = express.Router();
const {
    addInteraction,
    getCustomerInteractions,
    getLeadInteractions,
    getAllInteractionsForPerson,
    searchAllContacts,
    updateInteraction,
    deleteInteraction,
    getInteractionStats
} = require('../controllers/interactionController');

// ✅ البحث الموحد (Leads + Customers)
router.get('/search', searchAllContacts);

// ✅ إحصائيات التفاعلات
router.get('/stats', getInteractionStats);

// ✅ جلب كل التفاعلات لشخص (Lead + Customer معاً)
router.get('/person', getAllInteractionsForPerson);

// ✅ جلب تفاعلات عميل (Customer)
router.get('/customer/:id', getCustomerInteractions);

// ✅ جلب تفاعلات عميل محتمل (Lead)
router.get('/lead/:id', getLeadInteractions);

// ✅ إضافة تفاعل جديد
router.post('/', addInteraction);

// ✅ تعديل تفاعل
router.put('/:id', updateInteraction);

// ✅ حذف تفاعل (Soft Delete)
router.delete('/:id', deleteInteraction);

module.exports = router;