// db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

let pool;

if (process.env.DATABASE_URL) {
  // Use Railway URL directly
  pool = mysql.createPool(process.env.DATABASE_URL);
} else {
  // Local development fallback
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '12345678',
    database: process.env.DB_NAME || 'AiExtension',
    port: process.env.DB_PORT || 3306,
  });
}

module.exports = pool;
