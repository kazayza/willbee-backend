const express = require('express');
const router = express.Router();

const { getCustomers, createCustomer } = require('../controllers/customerController');

// GET /customers
router.get('/customers', getCustomers);

// POST /customers
router.post('/customers', createCustomer);

module.exports = router;