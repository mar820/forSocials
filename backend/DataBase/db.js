const mysql = require("mysql2/promise");
require("dotenv").config();

let dbConfig;

if (process.env.DATABASE_URL) {
  // Railway provides a full URL
  dbConfig = process.env.DATABASE_URL;
} else {
  // Local development fallback
  dbConfig = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "12345678",
    database: process.env.DB_NAME || "AiExtension",
  };
}

const pool = mysql.createPool(dbConfig);

module.exports = pool;
