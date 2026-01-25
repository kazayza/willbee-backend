const express = require('express');
const router = express.Router();
const eshrafController = require('../controllers/eshrafController');

// إضافة جزاء
router.post('/', eshrafController.addPenalty);

// بحث متقدم (لازم يكون قبل /:id عشان ميعتبرش كلمة search كأنها ID)
router.get('/search', eshrafController.searchEshraf);

// عرض جزاءات موظف
router.get('/:id', eshrafController.getEmployeePenalties);



module.exports = router;