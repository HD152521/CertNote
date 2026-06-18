import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { saveSubscription } from '@/lib/push/pushRepository';

export const dynamic = 'force-dynamic';

// 현재 로그인 사용자의 이 기기 푸시 구독을 저장.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');

    const body = await req.json().catch(() => null);
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
      throw new AppError(400, 'invalid_body', '구독 정보가 올바르지 않습니다.');
    }
    await saveSubscription(user.sub, { endpoint, keys: { p256dh, auth } });
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
