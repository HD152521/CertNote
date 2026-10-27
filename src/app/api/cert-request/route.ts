import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { query } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { parseCertRequest } from '@/lib/userInput/validate';

export const dynamic = 'force-dynamic';

const REQUEST_LIMIT_PER_HOUR = 5;

// "만들어 줬으면 하는 자격증" 요청(비로그인 허용).
// 같은 사람(계정 또는 이메일)이 같은 자격증을 다시 요청하면 조용히 무시한다 — 한 사람이 집계를 부풀리지 못하게.
// 비로그인·이메일 없는 요청은 식별자가 없어 중복을 못 거르므로 IP 레이트리밋만 건다.
export async function POST(req: Request) {
  try {
    const rl = rateLimit(`cert-request:${clientIp(req)}`, REQUEST_LIMIT_PER_HOUR, 60 * 60 * 1000);
    if (!rl.ok) throw new AppError(429, 'rate_limited', '잠시 후 다시 시도해 주세요.');

    const input = parseCertRequest(await req.json().catch(() => null));
    const session = await getCurrentUser();
    const userId = session?.sub ?? null;

    await query(
      `INSERT INTO cert_requests (cert_key, other_name, email, user_id)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM cert_requests
         WHERE cert_key = $1
           AND ($1 <> 'other' OR lower(other_name) = lower($2))
           AND (($4::bigint IS NOT NULL AND user_id = $4::bigint) OR ($3::text IS NOT NULL AND email = $3::text))
       )`,
      [input.certKey, input.otherName, input.email, userId],
    );
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
