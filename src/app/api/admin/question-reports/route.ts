import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

const STATUSES = ['open', 'resolved', 'dismissed'];

// 관리자: 문제 오류 신고의 처리 상태 변경. middleware가 /api/*를 막지 않으므로 직접 가드.
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session || session.role !== 'admin') throw new AppError(403, 'forbidden', '권한이 없습니다.');
    const body = await req.json().catch(() => null);
    const id = Number(body?.id);
    if (!Number.isInteger(id)) throw new AppError(400, 'invalid_body', 'id가 필요합니다.');
    const status = typeof body?.status === 'string' ? body.status : '';
    if (!STATUSES.includes(status)) throw new AppError(400, 'invalid_body', '상태값이 올바르지 않습니다.');
    await query('UPDATE question_reports SET status = $2 WHERE id = $1', [id, status]);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
