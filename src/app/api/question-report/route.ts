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
    // 로그인 사용자가 같은 문제를 미처리 상태에서 또 신고하면 무시한다(관리자 목록이 한 사람 신고로 덮이지 않게).
    await query(
      `INSERT INTO question_reports (question_id, user_id, reason, message)
       SELECT $1, $2, $3, $4
       WHERE $2::bigint IS NULL OR NOT EXISTS (
         SELECT 1 FROM question_reports WHERE user_id = $2::bigint AND question_id = $1 AND status = 'open'
       )`,
      [input.questionId, session?.sub ?? null, input.reason, input.message],
    );
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
