const express = require('express');
const router = express.Router();
const busController = require('../controllers/busController');

router.get('/', busController.getBusLines);
router.get('/children/:busLineId/:sessionId', busController.getBusLineChildren);
router.post('/', busController.addBusLine);
router.put('/:id', busController.updateBusLine);

module.exports = router;