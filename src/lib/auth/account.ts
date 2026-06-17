import { query } from '../db';

// 계정 관리용 저수준 DB 연산. AuthService(인증 핵심)와 달리, 로그인 사용자가
// 자신의 비밀번호를 바꾸거나 계정을 삭제하는 흐름을 담당한다.

export interface AccountAuthInfo {
  passwordHash: string;
  tokenVersion: number;
}

// 비밀번호 재확인용 해시 + 현재 token_version 조회. 사용자 없으면 null.
export async function getAccountAuthInfo(userId: string): Promise<AccountAuthInfo | null> {
  const rows = await query<{ password_hash: string; token_version: number }>(
    'SELECT password_hash, token_version FROM users WHERE id = $1',
    [userId],
  );
  if (!rows[0]) return null;
  return { passwordHash: rows[0].password_hash, tokenVersion: rows[0].token_version ?? 0 };
}

// 비밀번호 교체 + token_version 증가(기존 세션 무효화)를 한 번의 UPDATE로 원자 처리.
// 새 token_version을 반환 → 호출부가 새 세션 토큰에 담을 수 있다.
export async function changePassword(userId: string, newPasswordHash: string): Promise<number> {
  const rows = await query<{ token_version: number }>(
    `UPDATE users
        SET password_hash = $1, token_version = token_version + 1
      WHERE id = $2
      RETURNING token_version`,
    [newPasswordHash, userId],
  );
  return rows[0]?.token_version ?? 0;
}

// 사용자 행 삭제. 연관 테이블은 ON DELETE CASCADE(quiz_attempts/review_items/
// password_resets/email_verifications) 또는 SET NULL(waitlist)로 정리된다.
export async function deleteAccount(userId: string): Promise<void> {
  await query('DELETE FROM users WHERE id = $1', [userId]);
}
