import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { query } from '@/lib/db';

const DAY_MS = 24 * 60 * 60 * 1000;

// 관리자 전용 Pro 부여/해지(이메일 기준). middleware는 /api/* 를 막지 않으므로 여기서 직접 가드한다.
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session || session.role !== 'admin') {
      throw new AppError(403, 'forbidden', '권한이 없습니다.');
    }
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      throw new AppError(400, 'invalid_body', '이메일이 필요합니다.');
    }
    const rows = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows[0]) {
      throw new AppError(404, 'user_not_found', '해당 이메일의 사용자가 없습니다.');
    }
    const userId = String(rows[0].id);
    const svc = getEntitlementService();
    if (body?.action === 'revoke') {
      await svc.revoke(userId);
      return Response.json({ ok: true, plan: 'free' });
    }
    const months = Number.isFinite(body?.months) ? Number(body.months) : 0;
    const until = months > 0 ? new Date(Date.now() + months * 30 * DAY_MS) : null;
    await svc.grantPro(userId, until);
    return Response.json({ ok: true, plan: 'pro', until: until ? until.toISOString() : null });
  } catch (err) {
    return errorResponse(err);
  }
}
