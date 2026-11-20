import { AppError, errorResponse } from '@/lib/auth/errors';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { checkAnswer } from '@/lib/exam/examService';

// 비로그인 맛보기 정답 확인. 정답·해설을 한 문제씩만 돌려주고, IP 당 호출 수를 낮게 묶는다.
export async function POST(req: Request) {
  try {
    const rl = rateLimit(`exam-preview-check:${clientIp(req)}`, 40, 10 * 60_000);
    if (!rl.ok) throw new AppError(429, 'rate_limited', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    const body = await req.json().catch(() => null);
    if (!body || typeof body.questionId !== 'string' || typeof body.selected !== 'string') {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    const result = checkAnswer(body.questionId, body.selected, 'ko');
    if (!result) throw new AppError(404, 'not_found', '문제를 찾을 수 없습니다.');
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
