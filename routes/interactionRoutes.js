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
    getInteractionStats,
    getInteractionsNeedFollowUp
} = require('../controllers/interactionController');

// جلب التفاعلات اللي محتاجة متابعة
router.get('/need-followup', getInteractionsNeedFollowUp);

// البحث الموحد
router.get('/search', searchAllContacts);

// إحصائيات التفاعلات
router.get('/stats', getInteractionStats);

// جلب كل التفاعلات لشخص
router.get('/person', getAllInteractionsForPerson);

// جلب تفاعلات عميل
router.get('/customer/:id', getCustomerInteractions);

// جلب تفاعلات Lead
router.get('/lead/:id', getLeadInteractions);

// إضافة تفاعل جديد
router.post('/', addInteraction);

// تعديل تفاعل
router.put('/:id', updateInteraction);

// حذف تفاعل
router.delete('/:id', deleteInteraction);

module.exports = router;