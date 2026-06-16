import { getCurrentUser } from '@/lib/auth/currentUser';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { buildExam, MAX_COUNT } from '@/lib/exam/examService';

// 모의고사 문항 생성. 정답·해설은 내려가지 않는다(제출 시 서버 채점). 로그인 필요.
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    // 모의고사는 Pro 전용.
    await getEntitlementService().assertExamAccess(session.sub);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.count !== 'number') {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    const certSlug = typeof body.certSlug === 'string' && body.certSlug ? body.certSlug : null;
    const count = Math.min(Math.max(1, body.count), MAX_COUNT);
    const questions = buildExam(certSlug, count);
    if (questions.length === 0) {
      throw new AppError(404, 'no_questions', '해당 범위에 문제가 없습니다.');
    }
    return Response.json({ questions });
  } catch (err) {
    return errorResponse(err);
  }
}
