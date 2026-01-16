const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false, // مهم جداً للسيرفرات الخارجية زي somee
        trustServerCertificate: true // ضروري عشان الشهادات الأمنية
    }
};

const connectDB = async () => {
    try {
        await sql.connect(config);
        console.log('✅ Connected to SQL Server successfully!');
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1); // وقف التطبيق لو مفيش اتصال
    }
};

module.exports = { connectDB, sql };