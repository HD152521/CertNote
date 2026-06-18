import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { deleteSubscriptionByEndpoint } from '@/lib/push/pushRepository';

export const dynamic = 'force-dynamic';

// 이 기기의 구독을 서버에서 제거. endpoint는 비밀이 아니지만 로그인은 요구.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');

    const body = await req.json().catch(() => null);
    const endpoint = body?.endpoint;
    if (typeof endpoint !== 'string') {
      throw new AppError(400, 'invalid_body', 'endpoint가 필요합니다.');
    }
    await deleteSubscriptionByEndpoint(endpoint);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
