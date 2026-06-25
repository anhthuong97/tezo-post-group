// Chạy một lần: node seed-employees.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

const employees = [
  { username: 'admin',    password: 'Admin@123',  full_name: 'Quản trị viên',  role: 'admin', email: 'admin@company.com',   phone: '0901000001', start_date: '2024-01-01' },
  { username: 'nguyen',   password: 'Staff@123',  full_name: 'Nguyễn Văn A',   role: 'staff', email: 'nguyen@company.com',  phone: '0901000002', start_date: '2024-03-15' },
  { username: 'tran',     password: 'Staff@123',  full_name: 'Trần Thị B',     role: 'staff', email: 'tran@company.com',    phone: '0901000003', start_date: '2024-06-01' },
  { username: 'le',       password: 'Staff@123',  full_name: 'Lê Văn C',       role: 'staff', email: 'le@company.com',      phone: '0901000004', start_date: '2025-01-10' },
];

async function seed() {
  console.log('Đang tạo employees...\n');
  for (const e of employees) {
    const hash = await bcrypt.hash(e.password, 12);
    await pool.query(
      `INSERT INTO employees (username, password_hash, full_name, role, email, phone, start_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (username) DO NOTHING`,
      [e.username, hash, e.full_name, e.role, e.email, e.phone, e.start_date]
    );
    console.log(`✓ ${e.username.padEnd(10)} | ${e.full_name.padEnd(20)} | ${e.role} | pass: ${e.password}`);
  }
  console.log('\nXong!');
  await pool.end();
}

seed().catch((err) => { console.error(err.message); process.exit(1); });
