import { getCurrentUser } from '@/lib/auth/currentUser';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getReviewService } from '@/lib/review/factory';
import { recordActivity } from '@/lib/study/activity';

// 복습 한 문제 채점 + 다음 일정 갱신. 정답 여부는 서버가 판정한다.
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.questionId !== 'string' || typeof body.selected !== 'string') {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    // 무료 사용자는 Week1 문제만 복습 가능.
    await getEntitlementService().assertQuestionAccess(session.sub, body.questionId);
    const result = await getReviewService().review(session.sub, body.questionId, body.selected);
    await recordActivity(session.sub).catch(() => {}); // 스트릭용 활동 기록(실패 무시)
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
