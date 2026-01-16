const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// الاتصال بالداتابيز
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// =======================
// هنا بنعرف المسارات (Routes)
// =======================
app.use('/api/children', require('./routes/childRoutes'));

// مسارات المستخدمين
app.use('/api/users', require('./routes/userRoutes'));

// مسارات الموظفين
app.use('/api/employees', require('./routes/employeeRoutes'));

// مسارات المصروفات
app.use('/api/expenses', require('./routes/expenseRoutes'));

// مسارات الإيرادات
app.use('/api/incomes', require('./routes/incomeRoutes'));

//  للاطفال مسارات الغياب
app.use('/api/attendance', require('./routes/attendanceRoutes'));

// مسار لوحة المعلومات
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

// المسارات العامة (Lookup Tables)
app.use('/api/general', require('./routes/generalRoutes'));

// مسارات الاشتراكات والباصات
app.use('/api/bus-lines', require('./routes/busRoutes'));
app.use('/api/child-finance', require('./routes/childFinanceRoutes'));

// مسارات الجزاءات والسلف
app.use('/api/eshraf', require('./routes/eshrafRoutes'));

// مسارات المهام
app.use('/api/tasks', require('./routes/taskRoutes'));

app.use('/api/customers', require('./routes/customerRoutes'));

// مسارات التسويق
app.use('/api/leads', require('./routes/leadRoutes'));

// الحملات والإشعارات
app.use('/api/campaigns', require('./routes/campaignRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// Test Route
app.get('/', (req, res) => {
    res.send('🚀 WillBee Backend is Running!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

