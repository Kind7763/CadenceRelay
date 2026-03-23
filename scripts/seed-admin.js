const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'admin';

async function seed() {
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET password_hash = $2',
    [username, hash]
  );
  console.log('Admin user seeded: ' + username);
  await pool.end();
}

seed().catch((err) => { console.error(err); process.exit(1); });
