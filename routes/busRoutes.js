const express = require('express');
const router = express.Router();
const busController = require('../controllers/busController');

router.get('/', busController.getBusLines);

module.exports = router;