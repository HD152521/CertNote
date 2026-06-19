import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { clearPlan, listPlans, setPlan } from '@/lib/study/plan';
import { kstToday } from '@/lib/study/activity';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    return Response.json({ plans: await listPlans(user.sub) });
  } catch (err) {
    return errorResponse(err);
  }
}

// 시험일 설정/변경. body: { certSlug, examDate('YYYY-MM-DD') }
export async function PUT(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    const body = await req.json().catch(() => null);
    const certSlug = body?.certSlug;
    const examDate = body?.examDate;
    if (typeof certSlug !== 'string' || typeof examDate !== 'string' || !DATE_RE.test(examDate)) {
      throw new AppError(400, 'invalid_body', '자격증과 시험일(YYYY-MM-DD)이 필요합니다.');
    }
    if (Number.isNaN(new Date(`${examDate}T00:00:00Z`).getTime())) {
      throw new AppError(400, 'invalid_date', '올바른 날짜가 아닙니다.');
    }
    if (examDate < kstToday()) {
      throw new AppError(400, 'past_date', '시험일은 오늘 이후여야 합니다.');
    }
    await setPlan(user.sub, certSlug, examDate);
    return Response.json({ ok: true, plans: await listPlans(user.sub) });
  } catch (err) {
    return errorResponse(err);
  }
}

// 시험일 해제. body: { certSlug }
export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    const body = await req.json().catch(() => null);
    const certSlug = body?.certSlug;
    if (typeof certSlug !== 'string') throw new AppError(400, 'invalid_body', 'certSlug가 필요합니다.');
    await clearPlan(user.sub, certSlug);
    return Response.json({ ok: true, plans: await listPlans(user.sub) });
  } catch (err) {
    return errorResponse(err);
  }
}
