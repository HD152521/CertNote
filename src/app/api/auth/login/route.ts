import { NextResponse } from 'next/server';
import { getAuthService } from '@/lib/auth/factory';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { toPublicUser } from '@/lib/auth/types';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export async function POST(req: Request) {
  try {
    const rl = rateLimit(`login:${clientIp(req)}`, 5, 60_000);
    if (!rl.ok) {
      throw new AppError(429, 'rate_limited', `너무 많이 시도했습니다. ${rl.retryAfter}초 후 다시 시도해 주세요.`);
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    const user = await getAuthService().login(body.email, body.password);
    // 미인증 사용자도 로그인 허용(UI가 배너로 안내). ver에 현재 token_version을 담는다.
    const token = await createSessionToken({ sub: user.id, email: user.email, role: user.role, ver: user.tokenVersion });
    const res = NextResponse.json({ user: toPublicUser(user) });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
