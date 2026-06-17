import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { verifyPassword } from '@/lib/auth/passwords';
import { deleteAccount, getAccountAuthInfo } from '@/lib/auth/account';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clientIp, rateLimit } from '@/lib/rateLimit';

// 로그인 사용자의 계정 삭제. 비밀번호 재확인 후 users 행 삭제(연관 테이블 ON DELETE CASCADE).
// 성공 시 세션 쿠키 삭제. DELETE/POST 모두 지원.
async function handle(req: Request): Promise<Response> {
  try {
    const rl = rateLimit(`account-delete:${clientIp(req)}`, 5, 5 * 60_000);
    if (!rl.ok) {
      throw new AppError(429, 'rate_limited', `너무 많이 시도했습니다. ${rl.retryAfter}초 후 다시 시도해 주세요.`);
    }
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const body = await req.json().catch(() => null);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!password) {
      throw new AppError(400, 'invalid_body', '비밀번호를 입력하세요.');
    }

    const info = await getAccountAuthInfo(session.sub);
    if (!info) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    if (!(await verifyPassword(password, info.passwordHash))) {
      throw new AppError(400, 'invalid_credentials', '비밀번호가 올바르지 않습니다.');
    }

    await deleteAccount(session.sub);
    const res = NextResponse.json({ ok: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return handle(req);
}
