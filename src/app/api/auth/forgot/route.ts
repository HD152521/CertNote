import { AppError, errorResponse } from '@/lib/auth/errors';
import { createResetToken, findUserIdByEmail } from '@/lib/auth/passwordReset';
import { appUrl, getMailer } from '@/lib/mail/mailer';
import { clientIp, rateLimit } from '@/lib/rateLimit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 비밀번호 재설정 메일 발송. 계정 존재 여부를 노출하지 않기 위해 항상 동일하게 ok를 반환한다.
export async function POST(req: Request) {
  try {
    const rl = rateLimit(`forgot:${clientIp(req)}`, 3, 5 * 60_000);
    if (!rl.ok) {
      throw new AppError(429, 'rate_limited', `너무 많이 시도했습니다. ${rl.retryAfter}초 후 다시 시도해 주세요.`);
    }
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) {
      throw new AppError(400, 'invalid_email', '올바른 이메일을 입력해 주세요.');
    }
    const userId = await findUserIdByEmail(email);
    if (userId) {
      const token = await createResetToken(userId);
      const link = `${appUrl()}/reset?token=${token}`;
      await getMailer().send(
        email,
        'CertNote 비밀번호 재설정',
        `<p>아래 링크에서 비밀번호를 재설정하세요. 1시간 동안 유효합니다.</p><p><a href="${link}">${link}</a></p>`,
      );
    }
    // 존재하지 않는 이메일이어도 동일 응답.
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
