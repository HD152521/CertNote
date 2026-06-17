import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { hashPassword, verifyPassword } from '@/lib/auth/passwords';
import { changePassword, getAccountAuthInfo } from '@/lib/auth/account';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { clientIp, rateLimit } from '@/lib/rateLimit';

const MIN_PASSWORD_LENGTH = 8;

// 로그인 사용자의 비밀번호 변경. 현재 비번 검증 → 새 비번으로 교체 + token_version 증가(기존 세션 무효화).
// 본인 세션은 끊기지 않도록 새 ver로 쿠키를 재발급한다.
export async function POST(req: Request) {
  try {
    const rl = rateLimit(`account-password:${clientIp(req)}`, 5, 5 * 60_000);
    if (!rl.ok) {
      throw new AppError(429, 'rate_limited', `너무 많이 시도했습니다. ${rl.retryAfter}초 후 다시 시도해 주세요.`);
    }
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const body = await req.json().catch(() => null);
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
    if (!currentPassword || !newPassword) {
      throw new AppError(400, 'invalid_body', '현재 비밀번호와 새 비밀번호를 모두 입력하세요.');
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new AppError(400, 'weak_password', `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
    }

    const info = await getAccountAuthInfo(session.sub);
    if (!info) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    if (!(await verifyPassword(currentPassword, info.passwordHash))) {
      throw new AppError(400, 'invalid_credentials', '현재 비밀번호가 올바르지 않습니다.');
    }

    const newVersion = await changePassword(session.sub, await hashPassword(newPassword));
    // token_version이 증가했으므로 기존 토큰(이전 ver)은 무효. 본인 세션 유지를 위해 새 ver로 재발급.
    const token = await createSessionToken({
      sub: session.sub,
      email: session.email,
      role: session.role,
      ver: newVersion,
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
