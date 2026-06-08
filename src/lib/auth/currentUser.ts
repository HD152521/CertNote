import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from './session';

// 서버 컴포넌트/라우트에서 현재 로그인 사용자를 읽는다. 비로그인 시 null.
export async function getCurrentUser(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
