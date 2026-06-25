// Tạo user mới. Chạy: node create-user.js <username> <password>
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

async function main() {
  const [,, username, password] = process.argv;
  if (!username || !password) {
    console.error('Usage: node create-user.js <username> <password>');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    'INSERT INTO employees (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET password_hash = $2',
    [username.toLowerCase().trim(), hash]
  );
  console.log(`✓ Đã tạo/cập nhật user: ${username}`);
  await pool.end();
}

main().catch((err) => { console.error(err.message); process.exit(1); });
