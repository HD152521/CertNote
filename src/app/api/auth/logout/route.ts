import { NextResponse } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

// 쿠키 삭제는 굽힐 때와 동일한 속성(secure·sameSite·path)을 맞춰야 브라우저가 확실히 덮어쓴다.
// 속성이 어긋나면(특히 프로덕션 HTTPS의 Secure 쿠키) 만료가 누락돼 로그아웃 후에도 세션이 살아남는다.
export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', {
    ...sessionCookieOptions,
    maxAge: 0,
    expires: new Date(0),
  });
  return res;
}
