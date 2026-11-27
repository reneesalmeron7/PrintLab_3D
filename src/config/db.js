const path = require('path');
const mysql = require('mysql2');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000
});

pool.getConnection((err, conn) => {
  if (err) {
    console.error('Error de conexión a MariaDB:', err.message);
    return;
  }
  console.log('Conexión exitosa a MariaDB (PrintLab 3D)');
  conn.release();
});

module.exports = pool.promise();