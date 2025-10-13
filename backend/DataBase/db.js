// backend/DataBase/db.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

let pool;

if (process.env.DATABASE_URL) {
  console.log('✅ Using Railway DB connection');
  pool = mysql.createPool(process.env.DATABASE_URL);
} else {
  console.log('⚠️ Using local MySQL connection');
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '12345678',
    database: process.env.DB_NAME || 'AiExtension',
    port: process.env.DB_PORT || 3306,
  });
}

module.exports = pool;
