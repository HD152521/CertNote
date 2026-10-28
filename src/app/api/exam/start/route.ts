import { getCurrentUser } from '@/lib/auth/currentUser';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { buildExam, MAX_COUNT } from '@/lib/exam/examService';

// 모의고사 문항 생성. 정답·해설은 내려가지 않는다(제출 시 서버 채점). 로그인 필요.
export async function POST(req: Request) {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    // 플랜 가드. 페이월이 꺼져 있으면 로그인만으로 통과한다(policy.ts).
    await getEntitlementService().assertExamAccess(session.sub);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.count !== 'number') {
      throw new AppError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
    }
    const certSlug = typeof body.certSlug === 'string' && body.certSlug ? body.certSlug : null;
    const count = Math.min(Math.max(1, body.count), MAX_COUNT);
    // 도메인 필터(선택). 문자열만, 개수·길이 상한을 둔다.
    const domains = Array.isArray(body.domains)
      ? (body.domains as unknown[]).filter((d): d is string => typeof d === 'string' && d.length > 0 && d.length <= 120).slice(0, 40)
      : [];
    const questions = buildExam(certSlug, count, domains);
    if (questions.length === 0) {
      throw new AppError(404, 'no_questions', '해당 범위에 문제가 없습니다.');
    }
    return Response.json({ questions });
  } catch (err) {
    return errorResponse(err);
  }
}
