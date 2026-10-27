import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 관리자: 한 자격증(기타는 이름까지)의 요청자들에게 출시 알림을 보냈다고 표시한다.
// 표시된 요청자는 관리자 화면의 "알림 보낼 이메일"에서 빠진다. middleware가 /api/*를 막지 않으므로 직접 가드.
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session || session.role !== 'admin') throw new AppError(403, 'forbidden', '권한이 없습니다.');
    const body = await req.json().catch(() => null);
    const certKey = typeof body?.certKey === 'string' ? body.certKey : '';
    const otherName = typeof body?.otherName === 'string' ? body.otherName : '';
    if (!certKey) throw new AppError(400, 'invalid_body', 'certKey가 필요합니다.');
    await query(
      `UPDATE cert_requests SET notified_at = now()
       WHERE cert_key = $1 AND lower(coalesce(other_name, '')) = lower($2)
         AND user_id IS NOT NULL AND notified_at IS NULL`,
      [certKey, otherName],
    );
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
