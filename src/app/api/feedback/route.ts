import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { query } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const PHONE_RE = /^[0-9\-+\s()]{7,20}$/;
const MAX_MSG = 2000;

// 사용자 피드백 수집(비로그인 허용). 로그인 시 user_id도 기록.
export async function POST(req: Request) {
  try {
    const rl = rateLimit(`feedback:${clientIp(req)}`, 5, 60 * 60 * 1000);
    if (!rl.ok) throw new AppError(429, 'rate_limited', `잠시 후 다시 시도해 주세요.`);

    const body = await req.json().catch(() => null);
    const phone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!PHONE_RE.test(phone)) throw new AppError(400, 'invalid_phone', '연락처를 정확히 입력해 주세요.');
    if (message.length < 5) throw new AppError(400, 'invalid_message', '피드백 내용을 5자 이상 적어 주세요.');

    const session = await getCurrentUser();
    await query(
      'INSERT INTO feedback (user_id, phone, message) VALUES ($1, $2, $3)',
      [session?.sub ?? null, phone, message.slice(0, MAX_MSG)],
    );
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
