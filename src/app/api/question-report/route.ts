import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { query } from '@/lib/db';
import { getQuestionById } from '@/lib/questions';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import { parseQuestionReport } from '@/lib/userInput/validate';

export const dynamic = 'force-dynamic';

const REPORT_LIMIT_PER_HOUR = 10;

// 문제 오류 신고(비로그인 허용). 로그인 시 user_id 도 기록한다.
export async function POST(req: Request) {
  try {
    const rl = rateLimit(`question-report:${clientIp(req)}`, REPORT_LIMIT_PER_HOUR, 60 * 60 * 1000);
    if (!rl.ok) throw new AppError(429, 'rate_limited', '잠시 후 다시 시도해 주세요.');

    const input = parseQuestionReport(await req.json().catch(() => null));
    // 존재하지 않는 id 로 테이블을 채우지 못하게 실제 문제인지 확인한다.
    if (!getQuestionById(input.questionId)) throw new AppError(404, 'invalid_question', '문제를 찾을 수 없습니다.');

    const session = await getCurrentUser();
    await query(
      'INSERT INTO question_reports (question_id, user_id, reason, message) VALUES ($1, $2, $3, $4)',
      [input.questionId, session?.sub ?? null, input.reason, input.message],
    );
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
