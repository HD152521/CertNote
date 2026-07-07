import { NextResponse } from 'next/server';
import { googleAuthUrl, isGoogleLoginEnabled, OAUTH_STATE_COOKIE } from '@/lib/auth/oauth/google';
import { clientIp, rateLimit } from '@/lib/rateLimit';

// 구글 로그인 시작: state/nonce를 쿠키에 심고 구글 동의 화면으로 보낸다.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isGoogleLoginEnabled()) {
    return NextResponse.redirect(new URL('/login?error=google_disabled', url.origin));
  }
  const rl = rateLimit(`oauth:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.redirect(new URL('/login?error=rate_limited', url.origin));
  }
  // 로그인 후 돌아갈 내부 경로만 허용(외부 URL로의 오픈 리다이렉트 방지).
  let next = url.searchParams.get('next') || '/';
  if (!next.startsWith('/') || next.startsWith('//')) next = '/';

  // 프록시 뒤에서도 정확한 콜백 주소가 되도록 APP_URL 우선(로컬은 요청 origin).
  const origin = process.env.APP_URL?.replace(/\/$/, '') || url.origin;
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const res = NextResponse.redirect(
    googleAuthUrl({ redirectUri: `${origin}/api/auth/google/callback`, state, nonce }),
  );
  res.cookies.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, nonce, next }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600, // 10분 — 동의 화면에서 지체해도 충분, 방치된 쿠키는 자연 만료.
  });
  return res;
}
