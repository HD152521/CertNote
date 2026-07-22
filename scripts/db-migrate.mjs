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

  // 회원가입 프로필(테스터 데이터 수집). 모두 nullable — 기존 사용자/선택 항목 대비.
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS name             TEXT,
      ADD COLUMN IF NOT EXISTS birthdate        DATE,
      ADD COLUMN IF NOT EXISTS occupation       TEXT,
      ADD COLUMN IF NOT EXISTS target_cert      TEXT,
      ADD COLUMN IF NOT EXISTS purpose          TEXT,
      ADD COLUMN IF NOT EXISTS experience_level TEXT;
  `);
  console.log('✓ users 프로필 컬럼 준비 완료');

  // 소셜 로그인(OAuth) 연결. provider+sub 조합이 외부 계정의 고유 식별자.
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS oauth_provider TEXT,
      ADD COLUMN IF NOT EXISTS oauth_sub      TEXT;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_uq
      ON users (oauth_provider, oauth_sub)
      WHERE oauth_provider IS NOT NULL;
  `);
  console.log('✓ users OAuth 컬럼 준비 완료');

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

  // SM-2 개인화 간격 + 오답 이유. 기존 행은 DEFAULT로 안전 초기화(box 유지 → 마스터/카운트 무손실).
  // 다음 복습 때부터 각 항목이 SM-2로 재기준화된다(과거 due_at은 그대로).
  await pool.query(`
    ALTER TABLE review_items
      ADD COLUMN IF NOT EXISTS ef          REAL NOT NULL DEFAULT 2.5,
      ADD COLUMN IF NOT EXISTS interval    INT  NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reps        INT  NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_reason TEXT;
  `);
  console.log('✓ review_items SM-2 컬럼 준비 완료');

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

  // 이메일 인증 + 세션 무효화 컬럼.
  // DEFAULT 값으로 기존 사용자(특히 admin)가 잠기지 않게 한다:
  //   - email_verified DEFAULT true → 기존 사용자는 인증된 것으로 간주(로그인/배너 영향 없음).
  //   - token_version DEFAULT 0   → 기존 발급 세션의 ver(없으면 0으로 취급)과 일치 → 로그아웃되지 않음.
  // 멱등(IF NOT EXISTS): 재실행해도 기존 데이터를 덮어쓰지 않는다.
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS token_version  INT     NOT NULL DEFAULT 0;
  `);
  console.log('✓ users.email_verified / token_version 컬럼 준비 완료');

  // 이메일 인증 토큰. password_resets와 동일 패턴: 평문이 아닌 해시를 PK로 저장,
  // 만료/사용 시각으로 1회성 보장.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_verifications (
      token_hash TEXT PRIMARY KEY,
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications (user_id);');
  console.log('✓ email_verifications 테이블 준비 완료');

  // 알림(푸시) 설정 컬럼. 기존 사용자는 DEFAULT로 켜진 상태/08시(KST)로 수렴.
  // last_seen_at: N일 미방문 복귀 알림 판정용. last_inactive_notif_at: 복귀 알림 과발송 방지.
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS notify_review         BOOLEAN     NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS notify_inactive       BOOLEAN     NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS reminder_hour         INT         NOT NULL DEFAULT 8,
      ADD COLUMN IF NOT EXISTS last_inactive_notif_at TIMESTAMPTZ;
  `);
  console.log('✓ users 알림 설정 컬럼 준비 완료');

  // 웹 푸시 구독. 한 사용자가 여러 기기를 가질 수 있어 endpoint를 UNIQUE 키로.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         BIGSERIAL PRIMARY KEY,
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint   TEXT NOT NULL UNIQUE,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);');
  console.log('✓ push_subscriptions 테이블 준비 완료');

  // 합격 플랜: 자격증별 시험일 1건. 오늘 학습 분량은 콘텐츠 day를 생성일→시험일에 균등 분배해 계산.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS study_plans (
      id         BIGSERIAL PRIMARY KEY,
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cert_slug  TEXT NOT NULL,
      exam_date  DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, cert_slug)
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_study_plans_user ON study_plans (user_id);');
  console.log('✓ study_plans 테이블 준비 완료');

  // 학습 스트릭용 일별 활동 기록(KST 날짜). 읽기/퀴즈/복습 중 하나라도 하면 1행.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_activity (
      user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_date DATE NOT NULL,
      PRIMARY KEY (user_id, activity_date)
    );
  `);
  console.log('✓ daily_activity 테이블 준비 완료');

  // 사용자 피드백(폰+글). 보상(커피 기프티콘)은 관리자가 보고 수동 발송, rewarded로 발송여부 체크.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id         BIGSERIAL PRIMARY KEY,
      user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
      phone      TEXT NOT NULL,
      message    TEXT NOT NULL,
      rewarded   BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at DESC);');
  console.log('✓ feedback 테이블 준비 완료');

  // AI 튜터 일일 사용량(유저×KST날짜). LLM 비용 상한용 — 하루 N회 초과 차단.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tutor_usage (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day     DATE NOT NULL,
      count   INT NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
  `);
  console.log('✓ tutor_usage 테이블 준비 완료');

  // AI 튜터 첫 설명 캐시. (문제, 고른 오답)이 같으면 모든 사용자에게 동일하므로
  // 한 번만 생성해 저장하고 이후엔 LLM 호출 없이 재사용(비용·지연 절감).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tutor_explanations (
      id          BIGSERIAL PRIMARY KEY,
      question_id TEXT NOT NULL,
      selected    TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (question_id, selected)
    );
  `);
  console.log('✓ tutor_explanations 테이블 준비 완료');
} catch (err) {
  console.error('마이그레이션 실패:', err);
  process.exit(1);
} finally {
  await pool.end();
}
