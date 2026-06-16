// 사용자에게 Pro 권한을 수동 부여/해지한다(결제 연동 전 운영용).
// 사용법:
//   node --env-file=.env scripts/grant-pro.mjs <email>           # 무기한 Pro
//   node --env-file=.env scripts/grant-pro.mjs <email> 3         # 3개월 Pro
//   node --env-file=.env scripts/grant-pro.mjs <email> revoke    # Pro 해지
import pg from 'pg';

const [, , email, arg] = process.argv;
if (!email) {
  console.error('사용법: grant-pro.mjs <email> [months|revoke]');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL 환경변수가 필요합니다.');
  process.exit(1);
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const pool = new pg.Pool({ connectionString, ssl: isLocal ? false : { rejectUnauthorized: false } });

const DAY_MS = 24 * 60 * 60 * 1000;

try {
  if (arg === 'revoke') {
    const r = await pool.query(
      `UPDATE users SET plan = 'free', plan_status = 'canceled', current_period_end = now() WHERE email = $1 RETURNING id`,
      [email],
    );
    if (r.rowCount === 0) {
      console.error(`사용자를 찾을 수 없습니다: ${email}`);
      process.exit(1);
    }
    console.log(`✓ ${email} Pro 해지 완료`);
  } else {
    const months = arg ? Number.parseInt(arg, 10) : 0;
    const until = months > 0 ? new Date(Date.now() + months * 30 * DAY_MS) : null;
    const r = await pool.query(
      `UPDATE users SET plan = 'pro', plan_status = 'active', plan_since = now(), current_period_end = $2 WHERE email = $1 RETURNING id`,
      [email, until],
    );
    if (r.rowCount === 0) {
      console.error(`사용자를 찾을 수 없습니다: ${email}`);
      process.exit(1);
    }
    console.log(`✓ ${email} Pro 부여 완료 (만료: ${until ? until.toISOString() : '무기한'})`);
  }
} catch (err) {
  console.error('실패:', err);
  process.exit(1);
} finally {
  await pool.end();
}
