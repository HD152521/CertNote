import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { assertDevDatabaseUrl, readDatabaseUrl, resetTutorState } from './db';

export const E2E_FREE = { email: 'e2e-free@test.local', password: 'e2e-password-1' };
export const E2E_PRO = { email: 'e2e-pro@test.local', password: 'e2e-password-1' };

// 테스트 계정(free/pro)을 시드한다. 운영 DB 오염 방지를 위해 dev DB가 아니면 즉시 중단.
export default async function globalSetup() {
  const url = assertDevDatabaseUrl(readDatabaseUrl());
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
    await resetTutorState(E2E_FREE.email);
    console.log('✓ E2E 테스트 계정 시드 완료 (free/pro)');
  } finally {
    await pool.end();
  }
}
