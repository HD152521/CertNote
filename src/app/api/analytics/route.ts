import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getAnalytics } from '@/lib/analytics/analyticsService';
import { getDashboardData } from '@/lib/dashboard/dashboardService';
import { loadStudyContext } from '@/lib/personalization/context';

export const dynamic = 'force-dynamic';

// 로그인 사용자의 학습 분석: 합격 예측(추정) + 일자별 추이.
export async function GET() {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const ctx = await loadStudyContext(session.sub);
    const dash = getDashboardData(session.sub, ctx); // ctx 주입 → IO 없이 계산.
    const data = await getAnalytics(session.sub, 14, { ctx, dash: await dash });
    return Response.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
