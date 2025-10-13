// backend/DataBase/checkDb.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // 👈 one level up
const mysql = require('mysql2/promise');

(async () => {
  try {
    console.log('Connecting to:', process.env.DATABASE_URL);
    const conn = await mysql.createConnection(process.env.DATABASE_URL);
    const [rows] = await conn.query('SHOW TABLES;');
    console.log('Tables:', rows);
    await conn.end();
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
