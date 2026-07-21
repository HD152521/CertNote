import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { nextUp, weakDomainDrill } from '@/lib/recommend/recommendService';

export const dynamic = 'force-dynamic';

// 로그인 사용자의 개인화 추천: 다음 학습(nextUp) + 약점 드릴(weakDomainDrill).
// 무료 사용자는 recommendService 내부에서 week1 범위로 게이팅된다.
export async function GET() {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const [next, drill] = await Promise.all([
      nextUp(session.sub, 3),
      weakDomainDrill(session.sub, 5),
    ]);
    return Response.json({ nextUp: next, drill });
  } catch (err) {
    return errorResponse(err);
  }
}
