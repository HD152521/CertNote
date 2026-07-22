import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getAnalytics } from '@/lib/analytics/analyticsService';

export const dynamic = 'force-dynamic';

// 로그인 사용자의 학습 분석: 합격 예측(추정) + 일자별 추이.
export async function GET() {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const data = await getAnalytics(session.sub);
    return Response.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
