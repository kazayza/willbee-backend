const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// رابط تسجيل الدخول: /api/users/login
router.post('/login', userController.loginUser);

module.exports = router;