import { DEFAULT_CATEGORY } from '@/lib/category';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { clearPlan, listPlans, normalizeGoals, setPlan, setPlanGoals } from '@/lib/study/plan';
import { kstToday } from '@/lib/study/activity';
import { listCerts } from '@/lib/content';
import { setTargetCert } from '@/lib/profile/profileService';

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

// 시험일 설정/변경. body: { certSlug, examDate('YYYY-MM-DD'), targetAccuracy?, dailyMinutesGoal?, focus? }
// 목표 정하기 화면은 한 번에 저장한다: 목표 값이 오면 함께 저장하고, focus 면 프로필 목표 자격증도 이 자격증으로 맞춘다.
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
    // 실존 자격증만 허용 — 불량 slug가 들어오면 computeToday(getCertMeta)가 터져 대시보드·크론을 깨뜨린다.
    const certs = await listCerts(DEFAULT_CATEGORY);
    if (!certs.some((c) => c.slug === certSlug)) {
      throw new AppError(400, 'unknown_cert', '존재하지 않는 자격증입니다.');
    }
    await setPlan(user.sub, certSlug, examDate);
    if (body.targetAccuracy !== undefined || body.dailyMinutesGoal !== undefined) {
      // 한쪽만 보내도 다른 쪽이 기본값으로 덮이지 않게 기존 값과 합친다.
      const current = (await listPlans(user.sub)).find((p) => p.certSlug === certSlug);
      await setPlanGoals(
        user.sub,
        certSlug,
        normalizeGoals({
          targetAccuracy: body.targetAccuracy ?? current?.targetAccuracy,
          dailyMinutesGoal: body.dailyMinutesGoal !== undefined ? body.dailyMinutesGoal : current?.dailyMinutesGoal,
        }),
      );
    }
    if (body.focus === true) await setTargetCert(user.sub, certSlug);
    return Response.json({ ok: true, plans: await listPlans(user.sub) });
  } catch (err) {
    return errorResponse(err);
  }
}

// 학습 목표 갱신. body: { certSlug, targetAccuracy?, dailyMinutesGoal? }
export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    const body = await req.json().catch(() => null);
    if (typeof body?.certSlug !== 'string') {
      throw new AppError(400, 'invalid_body', 'certSlug가 필요합니다.');
    }
    await setPlanGoals(user.sub, body.certSlug, normalizeGoals(body));
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
