import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getPrefs, updatePrefs } from '@/lib/push/pushRepository';
import type { NotifPrefs } from '@/lib/push/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    const prefs = await getPrefs(user.sub);
    return Response.json({ prefs });
  } catch (err) {
    return errorResponse(err);
  }
}

// 알림 설정 부분 갱신. 전달된 필드만 반영.
export async function PUT(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    const patch: Partial<NotifPrefs> = {};
    if (typeof body.notifyReview === 'boolean') patch.notifyReview = body.notifyReview;
    if (typeof body.notifyInactive === 'boolean') patch.notifyInactive = body.notifyInactive;
    if (typeof body.reminderHour === 'number' && Number.isFinite(body.reminderHour)) {
      patch.reminderHour = body.reminderHour;
    }
    await updatePrefs(user.sub, patch);
    const prefs = await getPrefs(user.sub);
    return Response.json({ ok: true, prefs });
  } catch (err) {
    return errorResponse(err);
  }
}
