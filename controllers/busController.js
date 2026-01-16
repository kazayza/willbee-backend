const { sql } = require('../config/db');

// جلب خطوط الباص
const getBusLines = async (req, res) => {
    try {
        const result = await sql.query('SELECT ID, BusLine FROM tbl_BusLines ORDER BY ID ASC');
        res.status(200).json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching bus lines', error: err.message });
    }
};

module.exports = {
    getBusLines
};