import { query } from '../db';

// 계정 관리용 저수준 DB 연산. AuthService(인증 핵심)와 달리, 로그인 사용자가
// 자신의 비밀번호를 바꾸거나 계정을 삭제하는 흐름을 담당한다.

export interface AccountAuthInfo {
  email: string;
  passwordHash: string;
  tokenVersion: number;
  // 비밀번호로 로그인할 수 있는 계정인가(구글로 새로 가입했으면 false). 확인 수단 판정의 유일한 근거 —
  // 요청 본문에서 받은 값으로 대신하지 않는다.
  hasPassword: boolean;
}

// 본인 확인용 정보(이메일·해시·비밀번호 유무) + 현재 token_version 조회. 사용자 없으면 null.
// SELECT * 인 이유: has_password 컬럼이 아직 없는 DB(마이그레이션 전 배포)에서도 이 조회가 실패하지 않고
// 아래 `?? true` 로 "비밀번호 계정"에 수렴하게 하려는 것 — 마이페이지 SSR 이 500 을 내지 않는다.
// (쓰기 쪽 — 구글 가입 INSERT, 비밀번호 설정·변경 UPDATE — 는 컬럼이 없으면 실패하는 게 맞다. 마이그레이션 먼저.)
export async function getAccountAuthInfo(userId: string): Promise<AccountAuthInfo | null> {
  const rows = await query<{ email: string; password_hash: string; token_version: number; has_password?: boolean | null }>(
    'SELECT * FROM users WHERE id = $1',
    [userId],
  );
  if (!rows[0]) return null;
  return {
    email: rows[0].email,
    passwordHash: rows[0].password_hash,
    tokenVersion: rows[0].token_version ?? 0,
    // 값이 없거나 비면 비밀번호 계정으로 — 모를 때는 더 엄격한 확인(비밀번호)을 요구하는 쪽.
    hasPassword: rows[0].has_password ?? true,
  };
}

// 비밀번호 교체 + token_version 증가(기존 세션 무효화)를 한 번의 UPDATE로 원자 처리.
// 새 token_version을 반환 → 호출부가 새 세션 토큰에 담을 수 있다.
export async function changePassword(userId: string, newPasswordHash: string): Promise<number> {
  const rows = await query<{ token_version: number }>(
    `UPDATE users
        SET password_hash = $1, has_password = true, token_version = token_version + 1
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
