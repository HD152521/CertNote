import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getAttemptService } from '@/lib/quiz/attemptService';
import { getQuestionById } from '@/lib/questions';
import { buildWeaknessIndex, orderCardsByWeakness } from '@/lib/recommend/recommendService';
import { getReviewService } from '@/lib/review/factory';

const ATTEMPT_LIMIT = 5000;

// 지금 복습할(due) 문제 목록. 로그인 필요.
// ?order=weak → 정답률 낮은 영역(주차/도메인)의 카드를 먼저.
export async function GET(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const items = await getReviewService().listDue(session.sub);

    const order = new URL(req.url).searchParams.get('order');
    if (order === 'weak') {
      const attempts = await getAttemptService().list(session.sub, ATTEMPT_LIMIT);
      const index = buildWeaknessIndex(
        attempts.map((a) => ({ questionId: a.questionId, correct: a.correct })),
        getQuestionById,
      );
      return Response.json({ items: orderCardsByWeakness(items, index) });
    }
    return Response.json({ items });
  } catch (err) {
    return errorResponse(err);
  }
}
