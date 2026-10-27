import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { query } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { parseCertRequest } from '@/lib/userInput/validate';

export const dynamic = 'force-dynamic';

const REQUEST_LIMIT_PER_HOUR = 5;

// "만들어 줬으면 하는 자격증" 요청(비로그인 허용). 이메일은 받지 않는다 — 출시 알림은 로그인 사용자의 계정 이메일로만
// 보내므로, 남의 주소를 대신 넣거나 가짜 주소로 집계를 부풀릴 수 없다.
// 로그인 사용자가 같은 자격증을 다시 요청하면 조용히 무시한다. 비로그인 요청은 식별자가 없어 중복을 못 거르므로
// IP 레이트리밋만 건다 — 관리자 집계에서 로그인/비로그인을 나눠 본다.
export async function POST(req: Request) {
  try {
    const rl = rateLimit(`cert-request:${clientIp(req)}`, REQUEST_LIMIT_PER_HOUR, 60 * 60 * 1000);
    if (!rl.ok) throw new AppError(429, 'rate_limited', '잠시 후 다시 시도해 주세요.');

    const input = parseCertRequest(await req.json().catch(() => null));
    const session = await getCurrentUser();
    const userId = session?.sub ?? null;

    await query(
      `INSERT INTO cert_requests (cert_key, other_name, user_id)
       SELECT $1, $2, $3
       WHERE $3::bigint IS NULL OR NOT EXISTS (
         SELECT 1 FROM cert_requests
         WHERE user_id = $3::bigint
           AND cert_key = $1
           AND ($1 <> 'other' OR lower(other_name) = lower($2))
       )`,
      [input.certKey, input.otherName, userId],
    );
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
