import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { gradeExam } from '@/lib/exam/examService';

// 모의고사 제출 채점. 서버가 일괄 채점하고 응답분은 attempt로 기록(오답 자동 복습). 로그인 필요.
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.questionIds) || typeof body.answers !== 'object' || body.answers === null) {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    const questionIds = (body.questionIds as unknown[]).filter((x): x is string => typeof x === 'string');
    const answers = body.answers as Record<string, string>;
    const result = await gradeExam(session.sub, questionIds, answers);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
