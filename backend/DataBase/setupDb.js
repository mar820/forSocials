// backend/DataBase/setupDb.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('./db');

async function createTables() {
  let connection;
  try {
    connection = await db.getConnection();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        is_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        subscription_plan ENUM('free','starter','pro','power','lifetime') DEFAULT 'free',
        subscription_start TIMESTAMP NULL,
        subscription_end TIMESTAMP NULL,
        trial_start TIMESTAMP NULL,
        ai_requests_used INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Users table created or already exists');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ai_request_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        platform VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    console.log('✅ AI request logs table created or already exists');

  } catch (err) {
    console.error('❌ Error creating tables:', err);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
}

createTables();
