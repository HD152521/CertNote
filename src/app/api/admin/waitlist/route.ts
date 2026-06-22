import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 관리자 전용 대기자 처리. action: 'approve'(Pro 무기한 부여 + 대기자 제거) | 'remove'(목록에서만 제거).
// middleware는 /api/* 를 막지 않으므로 여기서 직접 admin 가드.
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session || session.role !== 'admin') {
      throw new AppError(403, 'forbidden', '권한이 없습니다.');
    }
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const action = body?.action === 'remove' ? 'remove' : 'approve';
    if (!email) throw new AppError(400, 'invalid_body', '이메일이 필요합니다.');

    if (action === 'approve') {
      const rows = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
      if (!rows[0]) {
        throw new AppError(404, 'user_not_found', '아직 가입하지 않은 이메일입니다. 가입 후 승인할 수 있어요.');
      }
      await getEntitlementService().grantPro(String(rows[0].id), null); // 무기한
    }
    await query('DELETE FROM waitlist WHERE email = $1', [email]);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
