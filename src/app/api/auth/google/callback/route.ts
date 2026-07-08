import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeGoogleCode, OAUTH_STATE_COOKIE } from '@/lib/auth/oauth/google';
import { getAuthService } from '@/lib/auth/factory';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';

// 구글 콜백: state 대조 → 코드 교환·id_token 검증 → 계정 찾기/연결/생성 → 세션 발급.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = process.env.APP_URL?.replace(/\/$/, '') || url.origin;

  function fail(code: string) {
    const res = NextResponse.redirect(new URL(`/login?error=${code}`, origin));
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }

  try {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return fail('google');

    const jar = await cookies();
    const raw = jar.get(OAUTH_STATE_COOKIE)?.value;
    if (!raw) return fail('google');
    let saved: { state?: string; nonce?: string; next?: string };
    try {
      saved = JSON.parse(raw);
    } catch {
      return fail('google');
    }
    // CSRF 방어의 핵심: 우리가 발급한 state와 구글이 돌려준 state가 일치해야 한다.
    if (!saved.state || !saved.nonce || saved.state !== state) return fail('google');

    const identity = await exchangeGoogleCode({
      code,
      redirectUri: `${origin}/api/auth/google/callback`,
      nonce: saved.nonce,
    });
    const { user, isNew } = await getAuthService().oauthLogin({ provider: 'google', ...identity });
    const token = await createSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      ver: user.tokenVersion,
    });

    const next = saved.next && saved.next.startsWith('/') && !saved.next.startsWith('//') ? saved.next : '/';
    // 신규 가입자는 프로필 보완 온보딩으로(원래 목적지는 완료/건너뛰기 후 이동).
    const dest = isNew
      ? `/onboarding/profile${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`
      : next;
    const res = NextResponse.redirect(new URL(dest, origin));
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  } catch (err) {
    console.error('[google-oauth]', err);
    return fail('google');
  }
}
