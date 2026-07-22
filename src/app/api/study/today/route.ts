import { DEFAULT_CATEGORY } from '@/lib/category';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { computeToday, listPlans } from '@/lib/study/plan';
import { getStreak, kstToday, listRecentActivity } from '@/lib/study/activity';
import { getAttemptService } from '@/lib/quiz/attemptService';
import { getQuestionById } from '@/lib/questions';
import { listCerts } from '@/lib/content';

const CALENDAR_DAYS = 12 * 7; // 히트맵 12주.
const ATTEMPT_LIMIT = 5000;

// 해당 자격증에서 실제로 완료한 day 수(퀴즈를 푼 distinct week#day). 뒤처짐 판정용.
async function completedDaysFor(userId: string, slug: string): Promise<number> {
  const attempts = await getAttemptService().list(userId, ATTEMPT_LIMIT);
  const done = new Set<string>();
  for (const a of attempts) {
    const q = getQuestionById(a.questionId);
    if (q && q.slug === slug && q.week > 0) done.add(`${q.week}#${q.day}`);
  }
  return done.size;
}

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
    const completedDays = await completedDaysFor(user.sub, target.certSlug);
    const portion = await computeToday(target, completedDays);

    const certs = await listCerts(DEFAULT_CATEGORY);
    const meta = certs.find((c) => c.slug === target.certSlug);
    return Response.json({
      streak,
      portion: {
        ...portion,
        certName: meta?.name ?? target.certSlug,
        certCode: meta?.code ?? '',
        targetAccuracy: target.targetAccuracy,
        dailyMinutesGoal: target.dailyMinutesGoal,
      },
      activity,
      today,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
