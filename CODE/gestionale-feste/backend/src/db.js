const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'gestionale_feste',
    user: process.env.DB_USER || 'gestionale',
    password: process.env.DB_PASSWORD || 'gestionale_password',
    waitForConnections: true,
    connectionLimit: 10
});

module.exports = pool;
