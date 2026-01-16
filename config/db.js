const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
    requestTimeout: 30000
};

// دالة الاتصال الذكية
const connectDB = async () => {
    try {
        // لو في اتصال شغال ومفتوح، ارجع واستخدمه
        if (sql.pool && sql.pool.connected) {
            return sql.pool;
        }

        // لو مفيش، او الاتصال مقفول، اقفل القديم وافتح جديد
        try {
            await sql.close();
        } catch (e) {
            // تجاهل أي خطأ أثناء الإغلاق
        }

        const pool = await sql.connect(config);
        sql.pool = pool; // نحفظه في المتغير العام
        console.log('✅ Connected/Reconnected to SQL Server');
        return pool;

    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        throw err;
    }
};

module.exports = { connectDB, sql };