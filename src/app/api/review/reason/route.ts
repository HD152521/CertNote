import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getReviewService } from '@/lib/review/factory';
import { WRONG_REASONS, type WrongReason } from '@/lib/review/types';

// 오답 이유 기록(개념부족/실수/기억안남). 채점과 분리 — 결과를 본 뒤 호출.
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const body = await req.json().catch(() => null);
    if (!body || typeof body.questionId !== 'string' || !WRONG_REASONS.includes(body.reason)) {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    await getReviewService().setReason(session.sub, body.questionId, body.reason as WrongReason);
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
