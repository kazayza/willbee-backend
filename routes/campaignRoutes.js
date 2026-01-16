const express = require('express');
const router = express.Router();
const campController = require('../controllers/campaignController');

router.post('/', campController.createCampaign);
router.get('/active', campController.getActiveCampaigns);

module.exports = router;