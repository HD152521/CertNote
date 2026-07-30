import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { listAllReviews, setReviewHidden } from '@/lib/reviews/reviewsRepository';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const session = await getCurrentUser();
  if (!session || session.role !== 'admin') throw new AppError(403, 'forbidden', '권한이 없습니다.');
  return session;
}

// GET /api/admin/reviews — 전체 후기(숨김 포함).
export async function GET() {
  try {
    await requireAdmin();
    const reviews = await listAllReviews();
    return Response.json({ reviews });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/admin/reviews — 후기 숨김/노출 토글. body: { id, hidden }
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => null);
    const id = body && typeof body.id === 'string' ? body.id : String(body?.id ?? '');
    if (!/^\d+$/.test(id)) throw new AppError(400, 'invalid_body', '잘못된 후기 id 입니다.');
    if (typeof body.hidden !== 'boolean') throw new AppError(400, 'invalid_body', 'hidden 값이 필요합니다.');
    await setReviewHidden(id, body.hidden);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
