import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { assertDevDatabaseUrl, readDatabaseUrl, resetTutorState } from './db';

export const E2E_FREE = { email: 'e2e-free@test.local', password: 'e2e-password-1' };
export const E2E_PRO = { email: 'e2e-pro@test.local', password: 'e2e-password-1' };
// 이메일 미인증 계정(가입만 하고 인증 링크를 누르지 않은 상태). AI 튜터는 이 계정에 403 email_unverified 를 내야 한다.
export const E2E_UNVERIFIED = { email: 'e2e-unverified@test.local', password: 'e2e-password-1' };

// 테스트 계정(free/pro)을 시드한다. 운영 DB 오염 방지를 위해 dev DB가 아니면 즉시 중단.
export default async function globalSetup() {
  const url = assertDevDatabaseUrl(readDatabaseUrl());
  const pool = new Pool({ connectionString: url });
  try {
    const hash = await bcrypt.hash(E2E_FREE.password, 10);
    for (const [u, plan, verified] of [
      [E2E_FREE, 'free', true],
      [E2E_PRO, 'pro', true],
      [E2E_UNVERIFIED, 'free', false],
    ] as const) {
      await pool.query(
        `INSERT INTO users (email, password_hash, plan, email_verified)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET password_hash = $2, plan = $3, email_verified = $4, token_version = 0`,
        [u.email, hash, plan, verified],
      );
    }
    await resetTutorState(E2E_FREE.email);
    await resetTutorState(E2E_UNVERIFIED.email);
    console.log('✓ E2E 테스트 계정 시드 완료 (free/pro/unverified)');
  } finally {
    await pool.end();
  }
}
