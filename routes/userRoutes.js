const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// تسجيل الدخول (بيرجع الصلاحيات أوتوماتيك)
router.post('/login', userController.loginUser);

// جلب صلاحيات مستخدم معين بالـ ID
router.get('/:id/permissions', userController.getUserPermissions);

// 🔐 تغيير كلمة المرور
router.post('/change-password', userController.changePassword);

module.exports = router;