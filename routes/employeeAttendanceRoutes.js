const express = require('express');
const router = express.Router();
const controller = require('../controllers/employeeAttendanceController');

// ✅ حفظ/تحديث الغياب
router.post('/', controller.saveEmpAttendance);

// ✅ عرض الغياب لتاريخ معين
router.get('/', controller.getEmpAttendanceByDate);

// ✅ عرض سجل كل الأيام (History)
router.get('/history', controller.getAttendanceHistory);

// ✅ حذف غياب
router.delete('/', controller.deleteEmpAttendance);

module.exports = router;