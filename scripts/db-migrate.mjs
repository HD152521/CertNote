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

  // 구독 권한(entitlement) 컬럼. plan='free'|'pro'. current_period_end=null 이면 무기한(수동 부여).
  // 결제 연동 시 webhook이 이 컬럼들만 갱신하면 게이팅은 그대로 동작한다.
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS plan               TEXT NOT NULL DEFAULT 'free',
      ADD COLUMN IF NOT EXISTS plan_status        TEXT,
      ADD COLUMN IF NOT EXISTS plan_since         TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
  `);
  console.log('✓ users.plan 컬럼 준비 완료');

  // 업그레이드 대기자(결제 전 수요 수집). 같은 이메일 중복 등록은 애플리케이션에서 무시.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS waitlist (
      id         BIGSERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist (email);');
  console.log('✓ waitlist 테이블 준비 완료');

  // 비밀번호 재설정 토큰. 평문이 아닌 해시를 PK로 저장하고, 만료/사용 시각으로 1회성 보장.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id);');
  console.log('✓ password_resets 테이블 준비 완료');
} catch (err) {
  console.error('마이그레이션 실패:', err);
  process.exit(1);
} finally {
  await pool.end();
}
