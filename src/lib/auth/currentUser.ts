import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from './session';
import { query } from '../db';

// 서버 컴포넌트/라우트(Node 런타임)에서 현재 로그인 사용자를 읽는다. 비로그인 시 null.
//
// 세션 무효화(token_version): 서명 검증을 통과한 토큰이라도, payload.ver가 DB의
// users.token_version과 다르면 무효 세션으로 보고 null을 반환한다. 비밀번호 변경/재설정 시
// token_version을 증가시키면 기존에 발급된 모든 세션이 다음 요청에서 무효화된다.
//
// 한계: middleware.ts는 Edge 런타임이라 DB 조회가 불가능 → 그곳에서는 서명/만료 검증만 한다.
// 따라서 token_version 기반 권위 판정은 이 getCurrentUser()(Node)에 의존하며, 보호 페이지/라우트는
// 반드시 이 함수를 통해 사용자를 확인해야 한다. (미들웨어는 1차 게이트일 뿐 권위가 아님)
export async function getCurrentUser(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;

  try {
    const rows = await query<{ token_version: number }>(
      'SELECT token_version FROM users WHERE id = $1',
      [session.sub],
    );
    // 사용자 없음(삭제됨) 또는 버전 불일치 → 무효 세션.
    if (!rows[0] || rows[0].token_version !== session.ver) {
      return null;
    }
  } catch (err) {
    // DB 조회 실패 시 보안상 비로그인으로 처리(열려있는 것보다 닫혀있는 게 안전).
    console.error('[auth] token_version 확인 실패:', err);
    return null;
  }

  return session;
}
