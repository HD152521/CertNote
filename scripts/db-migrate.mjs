// users 테이블 생성. 실행: npm run db:migrate (DATABASE_URL 필요)
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL 환경변수가 필요합니다. (.env 또는 셸 환경)');
  process.exit(1);
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const pool = new pg.Pool({ connectionString, ssl: isLocal ? false : { rejectUnauthorized: false } });

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           BIGSERIAL PRIMARY KEY,
      email        TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'user',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('✓ users 테이블 준비 완료');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id           BIGSERIAL PRIMARY KEY,
      user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id  TEXT NOT NULL,
      selected     TEXT,
      correct      BOOLEAN NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts (user_id);');
  console.log('✓ quiz_attempts 테이블 준비 완료');

  // 복습(SRS) 큐. 사용자×문제 1행, 오답 시 적재되고 박스/예정일이 갱신된다.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_items (
      id           BIGSERIAL PRIMARY KEY,
      user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id  TEXT NOT NULL,
      box          INT NOT NULL DEFAULT 0,
      due_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_result  BOOLEAN,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, question_id)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_review_items_due ON review_items (user_id, due_at);');
  console.log('✓ review_items 테이블 준비 완료');
} catch (err) {
  console.error('마이그레이션 실패:', err);
  process.exit(1);
} finally {
  await pool.end();
}
