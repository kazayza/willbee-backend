const express = require('express');
const router = express.Router();
const { 
    createCustomer, 
    getCustomers,
    updateCustomer,
    deleteCustomer,
    getCustomerById,
    getCustomersNeedFollowUp
} = require('../controllers/customerController');

// جلب العملاء اللي محتاجين متابعة
router.get('/need-followup', getCustomersNeedFollowUp);

// جلب قائمة العملاء
router.get('/', getCustomers);

// جلب عميل واحد
router.get('/:id', getCustomerById);

// إضافة عميل جديد
router.post('/', createCustomer);

// تعديل عميل
router.put('/:id', updateCustomer);

// حذف عميل
router.delete('/:id', deleteCustomer);

module.exports = router;