const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// 🔥 إضافة مهمة جداً لـ Vercel 🔥
// قبل ما ننفذ أي Route، تأكد إن الداتابيز متصلة
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next(); // كمل للخطوة الجاية
    } catch (err) {
        console.error('Connection Middleware Error:', err);
        res.status(500).json({ message: 'Database Connection Error', error: err.message });
    }
});

// تعريف المسارات (Routes)
app.use('/api/children', require('./routes/childRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/incomes', require('./routes/incomeRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/general', require('./routes/generalRoutes'));
app.use('/api/bus-lines', require('./routes/busRoutes'));
app.use('/api/child-finance', require('./routes/childFinanceRoutes'));
app.use('/api/eshraf', require('./routes/eshrafRoutes'));
app.use('/api/tasks', require('./routes/taskRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/leads', require('./routes/leadRoutes'));
app.use('/api/campaigns', require('./routes/campaignRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/emp-attendance', require('./routes/employeeAttendanceRoutes'));
app.use('/api/child-payments', require('./routes/childPaymentRoutes'));
app.use('/api/interactions', require('./routes/interactionRoutes'));
app.use('/api/salaries', require('./routes/salaryRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/system', require('./routes/systemRoutes'));

// Test Route
app.get('/', (req, res) => {
    res.send('🚀 WillBee Backend is Running!');
});



// تشغيل السيرفر (محلياً فقط)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// تصدير التطبيق لـ Vercel
module.exports = app;