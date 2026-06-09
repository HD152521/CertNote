import { getCurrentUser } from '@/lib/auth/currentUser';
import { getAttemptService } from '@/lib/quiz/attemptService';
import { AppError, errorResponse } from '@/lib/auth/errors';

// 로그인 사용자의 최근 풀이 기록 목록(대시보드/오답노트용).
export async function GET() {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const attempts = await getAttemptService().list(session.sub);
    return Response.json({ attempts });
  } catch (err) {
    return errorResponse(err);
  }
}
