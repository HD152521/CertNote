import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { deleteAccount, getAccountAuthInfo } from '@/lib/auth/account';
import { assertDeletionConfirmed } from '@/lib/auth/deleteConfirmation';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clientIp, rateLimit } from '@/lib/rateLimit';

// 로그인 사용자의 계정 삭제. 본인 확인 후 users 행 삭제(연관 테이블 ON DELETE CASCADE).
// 확인 수단은 계정 종류에 따라 다르다 — 비밀번호 계정은 비밀번호, 구글 전용 계정은 최근 로그인(10분) +
// 이메일 직접 입력(판정·근거는 assertDeletionConfirmed). 성공 시 세션 쿠키 삭제. DELETE/POST 모두 지원.
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

    const info = await getAccountAuthInfo(session.sub);
    if (!info) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    await assertDeletionConfirmed(info, body, session);

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
