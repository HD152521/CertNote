// 관리자 계정 시드. 실행: npm run db:seed
// 필요한 env: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
import pg from 'pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!connectionString || !email || !password) {
  console.error('DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD 환경변수가 모두 필요합니다.');
  process.exit(1);
}
if (password.length < 8) {
  console.error('ADMIN_PASSWORD는 8자 이상이어야 합니다.');
  process.exit(1);
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const pool = new pg.Pool({ connectionString, ssl: isLocal ? false : { rejectUnauthorized: false } });

try {
  const normalized = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);
  // 이미 있으면 admin 역할만 보장(중복 생성 방지).
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE SET role = 'admin'
     RETURNING id, email, role`,
    [normalized, passwordHash],
  );
  console.log('✓ 관리자 계정 준비 완료:', result.rows[0]);
} catch (err) {
  console.error('관리자 시드 실패:', err);
  process.exit(1);
} finally {
  await pool.end();
}
