import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

// 세션 쿠키를 즉시 만료시켜 로그아웃한다.
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
