
const express = require('express');
const router = express.Router();
const { createCustomer, getCustomers } = require('../controllers/customerController');

// جلب قائمة العملاء
// GET /api/customers
router.get('/', getCustomers);

// إضافة عميل جديد
// POST /api/customers
router.post('/', createCustomer);

module.exports = router;