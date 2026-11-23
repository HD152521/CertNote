import { AppError, errorResponse } from '@/lib/auth/errors';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { checkAnswer } from '@/lib/exam/examService';
import { normalizeLanguage } from '@/lib/i18n';
import { previewMessage } from '@/lib/exam/previewMessages';

// 비로그인 맛보기 정답 확인. 정답·해설을 한 문제씩만 돌려주고, IP 당 호출 수를 낮게 묶는다.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const lang = normalizeLanguage(body?.lang);
    const rl = rateLimit(`exam-preview-check:${clientIp(req)}`, 40, 10 * 60_000);
    if (!rl.ok) throw new AppError(429, 'rate_limited', previewMessage(lang, 'rateLimited'));
    if (!body || typeof body.questionId !== 'string' || typeof body.selected !== 'string') {
      throw new AppError(400, 'invalid_body', previewMessage(lang, 'badRequest'));
    }
    const result = checkAnswer(body.questionId, body.selected, lang);
    if (!result) throw new AppError(404, 'not_found', previewMessage(lang, 'notFound'));
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
