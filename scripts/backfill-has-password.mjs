// 기존 구글 전용 계정의 users.has_password=false 보정(수동 1회성). DATABASE_URL 필요.
//
//   node scripts/backfill-has-password.mjs                 # dry-run: 대상 목록·건수만 출력, 아무것도 바꾸지 않음
//   node scripts/backfill-has-password.mjs --apply         # 트랜잭션 안에서 UPDATE, 바뀐 id 를 현재 위치의 JSON 파일로 남김
//   node scripts/backfill-has-password.mjs --revert <파일>  # 그 파일의 id 들만 has_password=true 로 되돌림
//
// 왜 마이그레이션이 아닌가: 대상 판정이 기록 흔적에 기댄 추정이다. 실행 전에 목록을 사람이 보고,
// 잘못 바뀐 행은 정확히 그 행만 되돌릴 수 있어야 한다.
//
// 대상 조건(모두 만족):
//   - oauth_provider 가 있다(구글 연결됨)
//   - 구글 로그인 도입(2026-07-07 KST) 이후 생성 — 그 전 이메일 가입자는 인증 메일 기록이 없을 수 있어 제외
//   - email_verifications 행이 없다 — 이메일 가입은 항상 인증 토큰을 만들고, 구글 신규 가입은 만들지 않는다
//   - 사용된 password_resets 가 없다 — 재설정을 마쳤다면 본인이 정한 비밀번호가 있다
//   - 이미 false 가 아니다
// 오판 방향: 놓친 구글 전용 계정은 true 로 남는다(지금과 같고 '비밀번호 재설정'으로 풀 수 있다).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL 환경변수가 필요합니다. (.env 또는 셸 환경)');
  process.exit(1);
}

const args = process.argv.slice(2);
const mode = args.includes('--revert') ? 'revert' : args.includes('--apply') ? 'apply' : 'dry-run';
const revertFile = mode === 'revert' ? args[args.indexOf('--revert') + 1] : null;
if (mode === 'revert' && !revertFile) {
  console.error('--revert 뒤에 --apply 가 만든 JSON 파일 경로를 주세요.');
  process.exit(1);
}

const TARGET_WHERE = `
  u.has_password = true
  AND u.oauth_provider IS NOT NULL
  AND u.created_at >= TIMESTAMPTZ '2026-07-07 00:00:00+09'
  AND NOT EXISTS (SELECT 1 FROM email_verifications ev WHERE ev.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM password_resets pr WHERE pr.user_id = u.id AND pr.used_at IS NOT NULL)
`;

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
const pool = new pg.Pool({ connectionString, ssl: isLocal ? false : { rejectUnauthorized: false } });

function printRows(rows) {
  for (const r of rows) {
    const created = r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at);
    console.log(`  id=${r.id}\t${r.email}\tcreated_at=${created}\toauth=${r.oauth_provider}\temail_verified=${r.email_verified}`);
  }
}

try {
  if (mode === 'revert') {
    const saved = JSON.parse(readFileSync(revertFile, 'utf8'));
    const ids = Array.isArray(saved.ids) ? saved.ids.map(String) : [];
    if (ids.length === 0) {
      console.log('되돌릴 id 가 없습니다.');
    } else {
      const res = await pool.query(
        'UPDATE users SET has_password = true WHERE id = ANY($1::bigint[]) AND has_password = false RETURNING id',
        [ids],
      );
      console.log(`✓ revert: ${res.rowCount}개 행을 has_password=true 로 되돌림 (파일의 id ${ids.length}개 중)`);
    }
  } else {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT u.id, u.email, u.created_at, u.oauth_provider, u.email_verified
           FROM users u WHERE ${TARGET_WHERE} ORDER BY u.id`,
      );
      console.log(`[${mode}] 대상 ${rows.length}건`);
      printRows(rows);
      if (mode === 'dry-run' || rows.length === 0) {
        await client.query('ROLLBACK');
        if (mode === 'dry-run') console.log('dry-run: 아무것도 바꾸지 않았습니다. 확인 후 --apply 로 실행하세요.');
      } else {
        // 목록 조회와 UPDATE 사이에 상태가 바뀌어도 조건을 다시 걸어 조회 결과와 어긋나지 않게 한다.
        const res = await client.query(
          `UPDATE users u SET has_password = false
            WHERE u.id = ANY($1::bigint[]) AND ${TARGET_WHERE}
          RETURNING u.id`,
          [rows.map((r) => r.id)],
        );
        const ids = res.rows.map((r) => String(r.id));
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        // 실행한 위치에 남긴다. npm run 은 cwd 를 패키지 루트로 바꾸므로 원래 위치(INIT_CWD)를 먼저 본다.
        const file = path.resolve(process.env.INIT_CWD || process.cwd(), `has-password-backfill-${stamp}.json`);
        // 파일을 먼저 쓰고 커밋한다 — 커밋됐는데 되돌릴 목록이 없는 상황을 만들지 않는다.
        writeFileSync(file, JSON.stringify({ appliedAt: new Date().toISOString(), ids }, null, 2));
        await client.query('COMMIT');
        console.log(`✓ apply: ${ids.length}개 행을 has_password=false 로 변경`);
        console.log(`  되돌리기용 id 목록: ${file}`);
        console.log(`  되돌리기: node scripts/backfill-has-password.mjs --revert "${file}"`);
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
} catch (err) {
  console.error('보정 실패:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
