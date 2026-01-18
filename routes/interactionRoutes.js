const express = require('express');
const router = express.Router();
const { addInteraction, getCustomerInteractions } = require('../controllers/interactionController');

// تسجيل تفاعل جديد
// POST /api/interactions
router.post('/', addInteraction);

// جلب تفاعلات عميل معين
// GET /api/interactions/customer/:id
router.get('/customer/:id', getCustomerInteractions);

module.exports = router;