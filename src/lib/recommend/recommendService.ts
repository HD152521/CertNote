import { DEFAULT_CATEGORY } from '../category';
import { getAllDays, listCerts, type DayRef } from '../content';
import { buildTopicStats } from '../dashboard/dashboardService';
import { canAccessWeek, FREE_WEEK } from '../entitlement/policy';
import { getEntitlementService } from '../entitlement/factory';
import { getLearnerProfile } from '../profile/profileService';
import { getAttemptService } from '../quiz/attemptService';
import { getQuestionById, getQuestionsByCert } from '../questions';
import { computeToday, listPlans } from '../study/plan';

// 한 사용자의 풀이 기록 상한(약점 집계에 전량 필요).
const ATTEMPT_LIMIT = 5000;
const DEFAULT_DRILL_LIMIT = 5;

// ── 순수 선택 로직 (IO와 분리 — 단위테스트 대상) ─────────────────────────────

// 사용자가 약한 학습 버킷(정답률 낮은 주차/도메인). accuracy 오름차순이 약점 우선.
export interface WeakBucket {
  key: string; // 안정적 식별자, 예: 'topic:saa-c03#3'
  label: string; // 사람이 읽는 라벨, 예: 'SAA-C03 · Week 3'
  reason: 'domain' | 'topic';
  accuracy: number; // 0~100
}

// 드릴 후보 문제의 최소 형태(순수 함수 테스트 용이성 위해 IndexedQuestion 전체 대신).
export interface DrillCandidate {
  id: string;
  slug: string;
  week: number;
  day: number;
  number: number;
  prompt: string;
}

export interface DrillItem extends DrillCandidate {
  bucketKey: string;
  bucketLabel: string;
  reason: 'domain' | 'topic';
}

// 약점 버킷(약점 우선)에서 미마스터 문제를 최대 limit개 고른다(순수).
// - poolFor(key): 해당 버킷의 후보 문제(순서 무관). 접근권한 필터는 호출측(poolFor)이 책임.
// - excludeIds: 이미 맞힌/마스터한 문제 — 제외.
// - 버킷 간 중복 문제는 한 번만. 약점(accuracy 낮은) 버킷을 먼저 채운다.
export function selectDrillQuestions(
  buckets: WeakBucket[],
  poolFor: (key: string) => DrillCandidate[],
  excludeIds: ReadonlySet<string>,
  limit: number,
): DrillItem[] {
  if (limit <= 0) return [];
  const ordered = [...buckets].sort((a, b) => a.accuracy - b.accuracy);
  const picked = new Set<string>();
  const out: DrillItem[] = [];
  for (const bucket of ordered) {
    for (const q of poolFor(bucket.key)) {
      if (out.length >= limit) return out;
      if (excludeIds.has(q.id) || picked.has(q.id)) continue;
      picked.add(q.id);
      out.push({ ...q, bucketKey: bucket.key, bucketLabel: bucket.label, reason: bucket.reason });
    }
    if (out.length >= limit) return out;
  }
  return out;
}

// "오늘 이거 하세요" 추천 1건 이상.
export interface NextUpItem {
  slug: string;
  week: number;
  day: number;
  title: string;
  href: string;
  reason: 'plan_today' | 'start';
}

// 학습 플랜의 오늘 분량이 있으면 그것을, 없으면 콜드스타트(첫 day)를 추천한다(순수).
// 접근권한 필터는 호출측이 todayItems/fallbackDay에 이미 적용한다.
export function pickNextUp(params: {
  todayItems: DayRef[];
  fallbackDay: DayRef | null;
  limit: number;
}): NextUpItem[] {
  const { todayItems, fallbackDay, limit } = params;
  if (limit <= 0) return [];
  if (todayItems.length > 0) {
    return todayItems.slice(0, limit).map((d) => ({
      slug: d.slug,
      week: d.week,
      day: d.day,
      title: d.title,
      href: d.href,
      reason: 'plan_today' as const,
    }));
  }
  if (fallbackDay) {
    return [
      {
        slug: fallbackDay.slug,
        week: fallbackDay.week,
        day: fallbackDay.day,
        title: fallbackDay.title,
        href: fallbackDay.href,
        reason: 'start' as const,
      },
    ];
  }
  return [];
}

// ── IO 오케스트레이션 (읽기 전용 — 서버에서 호출) ───────────────────────────

// 약점 주차의 미마스터 문제를 큐잉한다. 무료 사용자는 week1 범위만.
export async function weakDomainDrill(userId: string, limit = DEFAULT_DRILL_LIMIT): Promise<DrillItem[]> {
  const [attempts, certs, ent] = await Promise.all([
    getAttemptService().list(userId, ATTEMPT_LIMIT),
    listCerts(DEFAULT_CATEGORY),
    getEntitlementService().getEntitlement(userId),
  ]);

  // 이미 맞힌 문제는 드릴에서 제외(약점=아직 못 맞힌 것에 집중).
  const solved = new Set(attempts.filter((a) => a.correct).map((a) => a.questionId));

  const codeBySlug = new Map(certs.map((c) => [c.slug, c.code]));
  const topics = buildTopicStats(
    attempts.map((a) => ({ questionId: a.questionId, correct: a.correct })),
    getQuestionById,
    codeBySlug,
  );

  // 오답이 있는(정답률 100 미만) 주차만 약점 버킷으로. buildTopicStats가 이미 약점 우선 정렬.
  const buckets: WeakBucket[] = topics
    .filter((t) => t.accuracy < 100)
    .map((t) => ({
      key: `topic:${t.slug}#${t.week}`,
      label: `${t.code} · Week ${t.week}`,
      reason: 'topic',
      accuracy: t.accuracy,
    }));

  const poolFor = (key: string): DrillCandidate[] => {
    const m = /^topic:(.+)#(\d+)$/.exec(key);
    if (!m) return [];
    const slug = m[1];
    const week = Number(m[2]);
    if (!canAccessWeek(ent.plan, week)) return []; // Pro 게이팅.
    return getQuestionsByCert(slug)
      .filter((q) => q.week === week)
      .map((q) => ({ id: q.id, slug: q.slug, week: q.week, day: q.day, number: q.number, prompt: q.prompt }));
  };

  return selectDrillQuestions(buckets, poolFor, solved, limit);
}

// 프로필 target_cert + 학습 플랜 기반 다음 학습 추천. 무료 사용자는 week1 범위만.
export async function nextUp(userId: string, limit = 1): Promise<NextUpItem[]> {
  const [profile, plans, ent] = await Promise.all([
    getLearnerProfile(userId),
    listPlans(userId),
    getEntitlementService().getEntitlement(userId),
  ]);

  const gate = (d: DayRef): boolean => canAccessWeek(ent.plan, d.week);

  // 목표 자격증 우선, 없으면 가장 임박한 플랜.
  const target = profile.targetCert;
  const plan = (target && plans.find((p) => p.certSlug === target)) || plans[0] || null;

  let todayItems: DayRef[] = [];
  if (plan) {
    const portion = await computeToday(plan);
    todayItems = portion.items.filter(gate);
  }

  // 콜드스타트: 목표(없으면 첫 자격증)의 접근 가능한 첫 day.
  let fallbackDay: DayRef | null = null;
  if (todayItems.length === 0) {
    const slug = target || plan?.certSlug || null;
    if (slug) {
      const days = await getAllDays(DEFAULT_CATEGORY, slug);
      fallbackDay = days.find(gate) ?? null;
    }
  }

  return pickNextUp({ todayItems, fallbackDay, limit });
}

export { FREE_WEEK };
