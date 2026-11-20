import { AppError, errorResponse } from '@/lib/auth/errors';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { buildExam } from '@/lib/exam/examService';
import { getExamCertSlugs } from '@/lib/exam/examBank';

/** 비로그인 맛보기 문항 수. 가입 전에 문제은행을 통째로 가져가지 못하게 작게 고정한다. */
const PREVIEW_COUNT = 5;

// 가입 전 맛보기: 자격증 하나에서 5문항을 정답 없이 내려준다. 기록은 남기지 않는다(로그인 필요 없음).
export async function POST(req: Request) {
  try {
    const rl = rateLimit(`exam-preview:${clientIp(req)}`, 20, 10 * 60_000);
    if (!rl.ok) throw new AppError(429, 'rate_limited', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    const body = await req.json().catch(() => null);
    const certSlug = body && typeof body.certSlug === 'string' ? body.certSlug : '';
    if (!getExamCertSlugs().includes(certSlug)) {
      throw new AppError(400, 'invalid_body', '자격증을 확인할 수 없습니다.');
    }
    const questions = buildExam(certSlug, PREVIEW_COUNT, [], 'ko');
    if (questions.length === 0) throw new AppError(404, 'no_questions', '해당 범위에 문제가 없습니다.');
    return Response.json({ questions });
  } catch (err) {
    return errorResponse(err);
  }
}
