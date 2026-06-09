import { getCurrentUser } from '@/lib/auth/currentUser';
import { getAttemptService } from '@/lib/quiz/attemptService';
import { AppError, errorResponse } from '@/lib/auth/errors';

// 로그인 사용자의 퀴즈 풀이 1건 기록. 정답 여부는 서버가 판정해 반환.
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
    const result = await getAttemptService().record(session.sub, body.questionId, body.selected);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
