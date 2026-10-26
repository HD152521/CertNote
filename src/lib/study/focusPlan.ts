// 대시보드·합격 예측·추천·오늘 분량이 함께 바라보는 "지금 집중하는 플랜" 하나를 고른다(순수).
// 예전에는 /api/study/today 는 가장 가까운 시험을, 합격 예측·추천은 프로필의 목표 자격증을 먼저 봐서
// 한 화면 안에서 카드마다 다른 자격증을 보여줄 수 있었다.
//
// 순서: 프로필 목표 자격증의 플랜 → 아직 지나지 않은 가장 가까운 시험 → 첫 플랜(시험일 오름차순 기준).
export function pickFocusPlan<T extends { certSlug: string; examDate: string }>(
  plans: readonly T[],
  targetCert: string | null,
  today: string,
): T | null {
  if (plans.length === 0) return null;
  const byTarget = targetCert ? plans.find((p) => p.certSlug === targetCert) : undefined;
  if (byTarget) return byTarget;
  return plans.find((p) => p.examDate >= today) ?? plans[0];
}

// 해당 자격증에서 실제로 마친 day 수(퀴즈를 푼 distinct week#day). 뒤처짐 판정·남은 분량 계산용(순수).
export function countCompletedDays(
  attempts: readonly { questionId: string }[],
  getQ: (id: string) => { slug: string; week: number; day: number } | undefined,
  slug: string,
): number {
  const done = new Set<string>();
  for (const a of attempts) {
    const q = getQ(a.questionId);
    if (q && q.slug === slug && q.week > 0) done.add(`${q.week}#${q.day}`);
  }
  return done.size;
}
