import { getCurrentUser } from '@/lib/auth/currentUser';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { rateLimit } from '@/lib/rateLimit';
import { checkAnswer } from '@/lib/exam/examService';

// 모의고사 연습 모드: 한 문제의 정답·해설을 바로 돌려준다. 기록은 마지막 제출(/api/exam/submit)에서만. 로그인 필요.
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    await getEntitlementService().assertExamAccess(session.sub);
    // 한 세트 최대 100문항 기준으로 넉넉히. 문제은행을 통째로 긁어 가는 것만 막는다.
    const rl = rateLimit(`exam-check:${session.sub}`, 300, 10 * 60_000);
    if (!rl.ok) {
      throw new AppError(429, 'rate_limited', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.questionId !== 'string' || typeof body.selected !== 'string') {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    const result = checkAnswer(body.questionId, body.selected);
    if (!result) {
      throw new AppError(404, 'not_found', '문제를 찾을 수 없습니다.');
    }
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
