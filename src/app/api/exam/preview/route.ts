import { AppError, errorResponse } from '@/lib/auth/errors';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { buildExam } from '@/lib/exam/examService';
import { getExamCertSlugs } from '@/lib/exam/examBank';
import { normalizeLanguage } from '@/lib/i18n';
import { previewMessage } from '@/lib/exam/previewMessages';

/** 비로그인 맛보기 문항 수. 가입 전에 문제은행을 통째로 가져가지 못하게 작게 고정한다. */
const PREVIEW_COUNT = 5;

// 가입 전 맛보기: 자격증 하나에서 5문항을 정답 없이 내려준다. 기록은 남기지 않는다(로그인 필요 없음).
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const lang = normalizeLanguage(body?.lang);
    const rl = rateLimit(`exam-preview:${clientIp(req)}`, 20, 10 * 60_000);
    if (!rl.ok) throw new AppError(429, 'rate_limited', previewMessage(lang, 'rateLimited'));
    const certSlug = body && typeof body.certSlug === 'string' ? body.certSlug : '';
    if (!getExamCertSlugs().includes(certSlug)) {
      throw new AppError(400, 'invalid_body', previewMessage(lang, 'invalidCert'));
    }
    const questions = buildExam(certSlug, PREVIEW_COUNT, [], lang);
    if (questions.length === 0) throw new AppError(404, 'no_questions', previewMessage(lang, 'noQuestions'));
    return Response.json({ questions });
  } catch (err) {
    return errorResponse(err);
  }
}
