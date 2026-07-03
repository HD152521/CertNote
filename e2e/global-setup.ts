import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

export const E2E_FREE = { email: 'e2e-free@test.local', password: 'e2e-password-1' };
export const E2E_PRO = { email: 'e2e-pro@test.local', password: 'e2e-password-1' };

// .env에서 DATABASE_URL을 읽는다(Next 서버와 같은 소스). dotenv 의존성 없이 최소 파싱.
function readDatabaseUrl(): string {
  const env = readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('.env에 DATABASE_URL이 없습니다.');
  return m[1].trim();
}

// 테스트 계정(free/pro)을 시드한다. 운영 DB 오염 방지를 위해 dev DB가 아니면 즉시 중단.
export default async function globalSetup() {
  const url = readDatabaseUrl();
  if (!url.includes('certnote_dev')) {
    throw new Error(
      'E2E는 certnote_dev DB에서만 실행합니다. .env의 DATABASE_URL이 운영(neondb)을 가리키고 있어 중단합니다.',
    );
  }
  const pool = new Pool({ connectionString: url });
  try {
    const hash = await bcrypt.hash(E2E_FREE.password, 10);
    for (const [u, plan] of [
      [E2E_FREE, 'free'],
      [E2E_PRO, 'pro'],
    ] as const) {
      await pool.query(
        `INSERT INTO users (email, password_hash, plan)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET password_hash = $2, plan = $3, token_version = 0`,
        [u.email, hash, plan],
      );
    }
    console.log('✓ E2E 테스트 계정 시드 완료 (free/pro)');
  } finally {
    await pool.end();
  }
}
