const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// ═══════════════════════════════════════════════════════════
// ملاحظة مهمة: المسارات الثابتة (forms, leads-assignees) لازم
// تيجي قبل المسارات الديناميكية (/:id) عشان متتلخبطش
// ═══════════════════════════════════════════════════════════

// تسجيل الدخول (بيرجع الصلاحيات أوتوماتيك)
router.post('/login', userController.loginUser);

// 🔑 إدارة المستخدمين والصلاحيات (للمدير/من له صلاحية frm_users)
router.get('/', userController.getAllUsers);              // قائمة كل المستخدمين
router.get('/forms', userController.getFormsAndRoles);    // قائمة الشاشات + الأدوار
router.get('/leads-assignees', userController.getLeadsAssignees);

// 🔐 تغيير كلمة المرور
router.post('/change-password', userController.changePassword);
// ✅ تحديث FCM Token
router.post('/update-fcm-token', userController.updateFcmToken);
// ✅ إرسال إشعار لمستخدم معين
router.post('/send-notification', userController.sendNotificationToUser);
// ✅ إرسال إشعار لجميع المستخدمين
router.post('/send-notification-all', userController.sendNotificationToAll);

// ─── مسارات ديناميكية (/:id) ───
router.get('/:id/permissions', userController.getUserPermissions);
router.get('/:id', userController.getUserById);           // مستخدم + صلاحياته
router.post('/', userController.createUser);              // إنشاء مستخدم
router.put('/:id', userController.updateUser);            // تعديل مستخدم
router.patch('/:id/status', userController.toggleUserActive); // تفعيل/تعطيل
router.delete('/:id', userController.deleteUser);         // حذف مستخدم

module.exports = router;
