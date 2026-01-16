const express = require('express');
const router = express.Router();
const childController = require('../controllers/childController');

// الرابط: /api/children/
router.get('/', childController.getAllChildren);

// الرابط: /api/children/123 (حيث 123 هو رقم الطفل)
router.get('/:id', childController.getChildById);

// إضافة طفل جديد (POST)
router.post('/', childController.createNewChild);

// تعديل بيانات طفل (بيحتاج ID)
router.put('/:id', childController.updateChild);

// حذف طفل (بيحتاج ID)
router.delete('/:id', childController.deleteChild);

module.exports = router;