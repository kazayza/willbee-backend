const express = require('express');
const router = express.Router();
const {
    linkChildToCustomer,
    getCustomerChildren,
    getChildCustomers,
    updateCustomerChild,
    unlinkChildFromCustomer,
    searchChildren
} = require('../controllers/customerChildrenController');

// ✅ البحث عن أطفال (للربط)
router.get('/search-children', searchChildren);

// ✅ جلب أطفال عميل معين
router.get('/customer/:customerId', getCustomerChildren);

// ✅ جلب أولياء أمور طفل معين
router.get('/child/:childId', getChildCustomers);

// ✅ ربط طفل بعميل
router.post('/', linkChildToCustomer);

// ✅ تعديل علاقة
router.put('/:id', updateCustomerChild);

// ✅ فك ارتباط (حذف)
router.delete('/:id', unlinkChildFromCustomer);

module.exports = router;