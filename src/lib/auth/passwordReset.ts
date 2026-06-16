import { createHash, randomBytes } from 'node:crypto';
import { query } from '../db';

// 비밀번호 재설정 토큰. 평문 토큰은 메일로만 전달하고 DB에는 해시만 저장한다(유출 대비).
const TTL_MS = 60 * 60 * 1000; // 1시간

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const rows = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  return rows[0] ? String(rows[0].id) : null;
}

export async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await query(
    'INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), userId, new Date(Date.now() + TTL_MS)],
  );
  return token;
}

// 유효(미사용·미만료)하면 사용 처리하고 userId 반환, 아니면 null. UPDATE ... RETURNING 으로 원자적 1회성 보장.
export async function consumeResetToken(token: string): Promise<string | null> {
  const rows = await query<{ user_id: string }>(
    `UPDATE password_resets SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hashToken(token)],
  );
  return rows[0] ? String(rows[0].user_id) : null;
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}
