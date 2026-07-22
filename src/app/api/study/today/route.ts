import { DEFAULT_CATEGORY } from '@/lib/category';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { computeToday, listPlans } from '@/lib/study/plan';
import { getStreak, kstToday, listRecentActivity } from '@/lib/study/activity';
import { listCerts } from '@/lib/content';

const CALENDAR_DAYS = 12 * 7; // 히트맵 12주.

export const dynamic = 'force-dynamic';

// 대시보드 위젯용: 스트릭 + 강조할 플랜(시험일 가장 가까운 미래, 없으면 가장 임박)의 오늘 분량.
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');

    const [plans, streak, activity] = await Promise.all([
      listPlans(user.sub),
      getStreak(user.sub),
      listRecentActivity(user.sub, CALENDAR_DAYS),
    ]);
    const today = kstToday();
    if (plans.length === 0) {
      return Response.json({ streak, portion: null, activity, today });
    }
    // listPlans는 시험일 오름차순 → 아직 안 지난 가장 가까운 시험, 없으면 첫 번째.
    const target = plans.find((p) => p.examDate >= today) ?? plans[0];
    const portion = await computeToday(target);

    const certs = await listCerts(DEFAULT_CATEGORY);
    const meta = certs.find((c) => c.slug === target.certSlug);
    return Response.json({
      streak,
      portion: { ...portion, certName: meta?.name ?? target.certSlug, certCode: meta?.code ?? '' },
      activity,
      today,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
