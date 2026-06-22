import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 관리자: 피드백의 기프티콘 발송여부(rewarded) 토글. middleware가 /api/*를 막지 않으므로 직접 가드.
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session || session.role !== 'admin') throw new AppError(403, 'forbidden', '권한이 없습니다.');
    const body = await req.json().catch(() => null);
    const id = Number(body?.id);
    if (!Number.isInteger(id)) throw new AppError(400, 'invalid_body', 'id가 필요합니다.');
    const rewarded = Boolean(body?.rewarded);
    await query('UPDATE feedback SET rewarded = $2 WHERE id = $1', [id, rewarded]);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
