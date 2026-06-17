import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { query } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/rateLimit';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 업그레이드 대기자 등록(결제 전 수요 수집). 중복 이메일은 조용히 무시한다.
export async function POST(req: Request) {
  try {
    const rl = rateLimit(`waitlist:${clientIp(req)}`, 5, 60_000);
    if (!rl.ok) {
      throw new AppError(429, 'rate_limited', `너무 많이 시도했습니다. ${rl.retryAfter}초 후 다시 시도해 주세요.`);
    }
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) {
      throw new AppError(400, 'invalid_email', '올바른 이메일을 입력해 주세요.');
    }
    const session = await getCurrentUser();
    await query(
      `INSERT INTO waitlist (email, user_id)
       SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM waitlist WHERE email = $1)`,
      [email, session?.sub ?? null],
    );
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
