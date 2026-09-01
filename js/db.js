const mysql = require('mysql2/promise');
const path = require('path');

// Carrega o arquivo .env localizado na raiz do projeto
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '033013Mi@', 
  database: process.env.DB_NAME || 'sistema_auditoria', 
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = db;