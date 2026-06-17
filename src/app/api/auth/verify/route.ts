import { AppError, errorResponse } from '@/lib/auth/errors';
import { consumeVerificationToken, markEmailVerified } from '@/lib/auth/emailVerification';
import { clientIp, rateLimit } from '@/lib/rateLimit';

// 이메일 인증 처리. 토큰 1회성 소비(원자적) → email_verified=true.
// GET(링크 직접 접근)과 POST(클라이언트 fetch) 모두 지원.
async function verify(token: string, ip: string): Promise<Response> {
  const rl = rateLimit(`verify:${ip}`, 20, 5 * 60_000);
  if (!rl.ok) {
    throw new AppError(429, 'rate_limited', `너무 많이 시도했습니다. ${rl.retryAfter}초 후 다시 시도해 주세요.`);
  }
  const userId = await consumeVerificationToken(token);
  if (!userId) {
    throw new AppError(400, 'invalid_token', '만료되었거나 이미 사용된 인증 링크입니다. 다시 요청해 주세요.');
  }
  await markEmailVerified(userId);
  return Response.json({ ok: true });
}

export async function GET(req: Request): Promise<Response> {
  try {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    return await verify(token, clientIp(req));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token : '';
    return await verify(token, clientIp(req));
  } catch (err) {
    return errorResponse(err);
  }
}
