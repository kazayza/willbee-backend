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

// Test Route
app.get('/', (req, res) => {
    res.send('🚀 WillBee Backend is Running!');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

