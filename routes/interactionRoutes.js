const express = require('express');
const router = express.Router();
const controller = require('../controllers/interactionController');

router.post('/', controller.addInteraction);
router.get('/:id', controller.getCustomerInteractions);

module.exports = router;