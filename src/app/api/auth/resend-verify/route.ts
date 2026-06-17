import { AppError, errorResponse } from '@/lib/auth/errors';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getVerificationStatus } from '@/lib/auth/emailVerification';
import { sendVerificationEmail } from '@/lib/mail/sendVerification';
import { clientIp, rateLimit } from '@/lib/rateLimit';

// 로그인 사용자가 미인증 상태일 때 인증 메일 재발송. 레이트리밋으로 남용 방지.
export async function POST(req: Request): Promise<Response> {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    // IP + 사용자 모두로 제한(스팸 억제).
    const rl = rateLimit(`resend-verify:${session.sub}:${clientIp(req)}`, 3, 10 * 60_000);
    if (!rl.ok) {
      throw new AppError(429, 'rate_limited', `너무 많이 요청했습니다. ${rl.retryAfter}초 후 다시 시도해 주세요.`);
    }

    const status = await getVerificationStatus(session.sub);
    if (!status) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    // 이미 인증된 경우는 동일하게 ok 반환(상태 노출 최소화, 멱등).
    if (!status.emailVerified) {
      await sendVerificationEmail(session.sub, status.email);
    }
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
