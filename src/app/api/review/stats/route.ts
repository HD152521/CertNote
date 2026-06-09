import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getReviewService } from '@/lib/review/factory';

// 복습 통계(총/복습필요/마스터). 헤더 배지·완료 화면에서 사용. 로그인 필요.
export async function GET() {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const stats = await getReviewService().stats(session.sub);
    return Response.json(stats);
  } catch (err) {
    return errorResponse(err);
  }
}
