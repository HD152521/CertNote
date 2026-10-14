import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

// .env에서 DATABASE_URL을 읽는다(Next 서버와 같은 소스). dotenv 의존성 없이 최소 파싱.
export function readDatabaseUrl(): string {
  const env = readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('.env에 DATABASE_URL이 없습니다.');
  return m[1].trim();
}

// 운영 DB 오염 방지 가드. dev DB(certnote_dev)가 아니면 즉시 중단한다. E2E의 모든 DB 접근은 이 함수를 거친다.
export function assertDevDatabaseUrl(url: string): string {
  if (!url.includes('certnote_dev')) {
    throw new Error(
      'E2E는 certnote_dev DB에서만 실행합니다. .env의 DATABASE_URL이 운영(neondb)을 가리키고 있어 중단합니다.',
    );
  }
  return url;
}

export async function withDevPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: assertDevDatabaseUrl(readDatabaseUrl()) });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

// 가짜 튜터 테스트가 결정적이도록 e2e 계정의 오늘(KST) tutor_usage 행을 지우고, 가짜 설명 캐시도 비운다.
export async function resetTutorState(email: string): Promise<void> {
  await withDevPool(async (pool) => {
    await pool.query(
      `DELETE FROM tutor_usage
       WHERE user_id = (SELECT id FROM users WHERE email = $1)
         AND day = (now() AT TIME ZONE 'Asia/Seoul')::date`,
      [email],
    );
    await pool.query(`DELETE FROM tutor_explanations WHERE content LIKE '[E2E-FAKE]%'`);
    // 전역 카운터도 비운다 — 안 그러면 e2e 를 돌릴 때마다 오늘 합산이 쌓여 언젠가 503 이 난다.
    await pool.query(`DELETE FROM tutor_global_usage WHERE day = (now() AT TIME ZONE 'Asia/Seoul')::date`);
  });
}

// 오늘(KST) 전역 tutor_global_usage.count 를 지정값으로 만든다(상한 도달 상태를 즉시 재현). 행이 없으면 생성.
export async function setTutorGlobalCount(count: number): Promise<void> {
  await withDevPool(async (pool) => {
    await pool.query(
      `INSERT INTO tutor_global_usage (day, count) VALUES ((now() AT TIME ZONE 'Asia/Seoul')::date, $1)
       ON CONFLICT (day) DO UPDATE SET count = $1`,
      [count],
    );
  });
}

// 오늘(KST) 전역 tutor_global_usage.count. 행이 없으면 0.
export async function readTutorGlobalCount(): Promise<number> {
  return withDevPool(async (pool) => {
    const r = await pool.query<{ count: number }>(
      `SELECT count FROM tutor_global_usage WHERE day = (now() AT TIME ZONE 'Asia/Seoul')::date`,
    );
    return r.rows[0]?.count ?? 0;
  });
}

// 오늘(KST) tutor_usage.count. 행이 없으면 0.
export async function readTutorCount(email: string): Promise<number> {
  return withDevPool(async (pool) => {
    const r = await pool.query<{ count: number }>(
      `SELECT count FROM tutor_usage
       WHERE user_id = (SELECT id FROM users WHERE email = $1)
         AND day = (now() AT TIME ZONE 'Asia/Seoul')::date`,
      [email],
    );
    return r.rows[0]?.count ?? 0;
  });
}

// 테스트 계정의 이메일 인증 상태를 바꾼다(다른 탭에서 인증을 마친 상황을 재현).
export async function setEmailVerified(email: string, verified: boolean): Promise<void> {
  await withDevPool(async (pool) => {
    await pool.query('UPDATE users SET email_verified = $2 WHERE email = $1', [email, verified]);
  });
}
