import { randomBytes } from 'node:crypto';
import { query } from '../db';
import { hashToken } from './passwordReset';

// 이메일 인증 토큰. password_resets와 동일 패턴: 평문은 메일로만 전달하고 DB엔 해시만 저장,
// 만료/사용 시각으로 1회성 보장.
const TTL_MS = 24 * 60 * 60 * 1000; // 24시간

export async function createVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await query(
    'INSERT INTO email_verifications (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [hashToken(token), userId, new Date(Date.now() + TTL_MS)],
  );
  return token;
}

// 유효(미사용·미만료)하면 사용 처리하고 userId 반환, 아니면 null.
// UPDATE ... RETURNING 으로 원자적 1회성 보장.
export async function consumeVerificationToken(token: string): Promise<string | null> {
  if (!token) return null;
  const rows = await query<{ user_id: string }>(
    `UPDATE email_verifications SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hashToken(token)],
  );
  return rows[0] ? String(rows[0].user_id) : null;
}

export async function markEmailVerified(userId: string): Promise<void> {
  await query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
}

// 미인증 사용자 정보(재발송 판단용). 사용자 없거나 이미 인증됨이면 그에 맞게 반영.
export interface VerificationStatus {
  email: string;
  emailVerified: boolean;
}

export async function getVerificationStatus(userId: string): Promise<VerificationStatus | null> {
  const rows = await query<{ email: string; email_verified: boolean }>(
    'SELECT email, email_verified FROM users WHERE id = $1',
    [userId],
  );
  if (!rows[0]) return null;
  return { email: rows[0].email, emailVerified: rows[0].email_verified ?? true };
}
