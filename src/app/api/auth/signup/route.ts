import { NextResponse } from 'next/server';
import { getAuthService } from '@/lib/auth/factory';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/session';
import { toPublicUser } from '@/lib/auth/types';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { sendVerificationEmail } from '@/lib/mail/sendVerification';

export async function POST(req: Request) {
  try {
    const rl = rateLimit(`signup:${clientIp(req)}`, 5, 60_000);
    if (!rl.ok) {
      throw new AppError(429, 'rate_limited', `너무 많이 시도했습니다. ${rl.retryAfter}초 후 다시 시도해 주세요.`);
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    // 개인정보 수집·이용 동의 필수.
    if (body.consent !== true) {
      throw new AppError(400, 'consent_required', '개인정보 수집·이용에 동의해 주세요.');
    }
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const name = str(body.name);
    const birthdate = str(body.birthdate);
    const targetCert = str(body.targetCert);
    if (!name) throw new AppError(400, 'name_required', '이름을 입력해 주세요.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) throw new AppError(400, 'birthdate_required', '생년월일을 입력해 주세요.');
    if (!targetCert) throw new AppError(400, 'target_cert_required', '목표 자격증을 선택해 주세요.');
    const profile = {
      name,
      birthdate,
      targetCert,
      occupation: str(body.occupation) || undefined,
      purpose: str(body.purpose) || undefined,
      experienceLevel: str(body.experienceLevel) || undefined,
    };
    const user = await getAuthService().signup(body.email, body.password, profile);
    // 인증 메일 발송. 메일 실패가 가입 자체를 막지 않도록 실패는 로깅만(사용자는 재발송 가능).
    try {
      await sendVerificationEmail(user.id, user.email);
    } catch (mailErr) {
      console.error('[auth] 인증 메일 발송 실패:', mailErr);
    }
    const token = await createSessionToken({ sub: user.id, email: user.email, role: user.role, ver: user.tokenVersion });
    const res = NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
