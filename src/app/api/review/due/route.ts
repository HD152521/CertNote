import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getReviewService } from '@/lib/review/factory';

// 지금 복습할(due) 문제 목록. 로그인 필요.
export async function GET() {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const items = await getReviewService().listDue(session.sub);
    return Response.json({ items });
  } catch (err) {
    return errorResponse(err);
  }
}
