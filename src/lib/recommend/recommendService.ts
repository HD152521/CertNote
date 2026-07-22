import { DEFAULT_CATEGORY } from '../category';
import { getAllDays, type DayRef } from '../content';
import { buildTopicStats } from '../dashboard/dashboardService';
import { canAccessWeek, canTakeExam, FREE_WEEK } from '../entitlement/policy';
import { getExamQuestionsByDomain } from '../exam/examBank';
import { loadStudyContext, type StudyContext } from '../personalization/context';
import { getQuestionById, getQuestionsByCert } from '../questions';
import { computeToday } from '../study/plan';

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

// 화면에서 바로 이동할 링크가 붙은 드릴 항목(IO 계층이 반환).
export interface DrillRec extends DrillItem {
  href: string;
}

// 드릴 항목의 이동 링크(순수). topic=해당 day 페이지, domain=모의고사(day 좌표 없음).
export function drillHref(item: DrillItem): string {
  if (item.reason === 'domain') return '/exam';
  return `/${DEFAULT_CATEGORY}/${item.slug}/week${item.week}/day${item.day}`;
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

// 약점 인덱스: 주차(topic)·도메인별 정답률 조회표. 복습 "약점부터" 정렬에 쓴다.
export interface WeaknessIndex {
  topic: Record<string, number>; // `${slug}#${week}` → accuracy(0~100)
  domain: Record<string, number>; // domain → accuracy(0~100)
}

interface WeaknessAttempt {
  questionId: string;
  correct: boolean;
}

// 풀이 기록 → 주차·도메인별 정답률(순수). getQ 주입으로 DB 없이 테스트 가능.
export function buildWeaknessIndex(
  attempts: WeaknessAttempt[],
  getQ: (id: string) => { slug: string; week: number; domain?: string } | undefined,
): WeaknessIndex {
  const topicAgg = new Map<string, { a: number; c: number }>();
  const domainAgg = new Map<string, { a: number; c: number }>();
  const bump = (m: Map<string, { a: number; c: number }>, key: string, correct: boolean) => {
    const cur = m.get(key) ?? { a: 0, c: 0 };
    cur.a += 1;
    if (correct) cur.c += 1;
    m.set(key, cur);
  };
  for (const at of attempts) {
    const q = getQ(at.questionId);
    if (!q) continue;
    if (q.week > 0) bump(topicAgg, `${q.slug}#${q.week}`, at.correct);
    if (q.domain) bump(domainAgg, q.domain, at.correct);
  }
  const toRec = (m: Map<string, { a: number; c: number }>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, v] of m) out[k] = Math.round((v.c / v.a) * 100);
    return out;
  };
  return { topic: toRec(topicAgg), domain: toRec(domainAgg) };
}

// 정답률 미상(한 번도 안 푼 영역)은 정렬 뒤로 보내는 중립값. 100 초과라 약점보다 뒤.
const UNKNOWN_ACCURACY = 101;

// 복습 카드를 약점(정답률 낮은) 순으로 정렬(순수, 안정적). 원본은 불변.
export function orderCardsByWeakness<T extends { slug: string; week: number; domain?: string }>(
  cards: T[],
  index: WeaknessIndex,
): T[] {
  const accuracyOf = (c: T): number => {
    if (c.week > 0) return index.topic[`${c.slug}#${c.week}`] ?? UNKNOWN_ACCURACY;
    if (c.domain) return index.domain[c.domain] ?? UNKNOWN_ACCURACY;
    return UNKNOWN_ACCURACY;
  };
  return cards
    .map((card, i) => ({ card, i, acc: accuracyOf(card) }))
    .sort((x, y) => x.acc - y.acc || x.i - y.i)
    .map((e) => e.card);
}

// ── IO 오케스트레이션 (읽기 전용 — 서버에서 호출) ───────────────────────────

// 약점 영역의 미마스터 문제를 큐잉한다(주차 + 모의고사 도메인). 무료는 week1, 도메인은 Pro만.
// ctx 주입 시 공유 컨텍스트 재사용(대시보드 중복 조회 방지).
export async function weakDomainDrill(userId: string, limit = DEFAULT_DRILL_LIMIT, ctx?: StudyContext): Promise<DrillRec[]> {
  const { attempts, certs, entitlement: ent } = ctx ?? (await loadStudyContext(userId));

  // 이미 맞힌 문제는 드릴에서 제외(약점=아직 못 맞힌 것에 집중).
  const solved = new Set(attempts.filter((a) => a.correct).map((a) => a.questionId));
  const graded = attempts.map((a) => ({ questionId: a.questionId, correct: a.correct }));

  const codeBySlug = new Map(certs.map((c) => [c.slug, c.code]));
  const topics = buildTopicStats(graded, getQuestionById, codeBySlug);

  // 주차 버킷(day 퀴즈) — 오답 있는(정답률<100) 주차만. buildTopicStats가 약점 우선 정렬.
  const topicBuckets: WeakBucket[] = topics
    .filter((t) => t.accuracy < 100)
    .map((t) => ({
      key: `topic:${t.slug}#${t.week}`,
      label: `${t.code} · Week ${t.week}`,
      reason: 'topic',
      accuracy: t.accuracy,
    }));

  // 도메인 버킷(모의고사) — 정답률<100 도메인. selectDrillQuestions가 정답률로 함께 정렬.
  const { domain: domainAcc } = buildWeaknessIndex(graded, getQuestionById);
  const domainBuckets: WeakBucket[] = Object.entries(domainAcc)
    .filter(([, acc]) => acc < 100)
    .map(([domain, acc]) => ({ key: `domain:${domain}`, label: domain, reason: 'domain', accuracy: acc }));

  const buckets = [...topicBuckets, ...domainBuckets];

  const poolFor = (key: string): DrillCandidate[] => {
    const tm = /^topic:(.+)#(\d+)$/.exec(key);
    if (tm) {
      const week = Number(tm[2]);
      if (!canAccessWeek(ent.plan, week)) return []; // 무료는 week1까지.
      return getQuestionsByCert(tm[1])
        .filter((q) => q.week === week)
        .map((q) => ({ id: q.id, slug: q.slug, week: q.week, day: q.day, number: q.number, prompt: q.prompt }));
    }
    const dm = /^domain:(.+)$/.exec(key);
    if (dm) {
      if (!canTakeExam(ent.plan)) return []; // 모의고사 도메인 드릴은 Pro 전용.
      return getExamQuestionsByDomain(dm[1]).map((q) => ({
        id: q.id,
        slug: q.slug,
        week: 0,
        day: 0,
        number: q.number,
        prompt: q.prompt,
      }));
    }
    return [];
  };

  return selectDrillQuestions(buckets, poolFor, solved, limit).map((item) => ({ ...item, href: drillHref(item) }));
}

// 프로필 target_cert + 학습 플랜 기반 다음 학습 추천. 무료 사용자는 week1 범위만.
// ctx 주입 시 공유 컨텍스트 재사용(대시보드 중복 조회 방지).
export async function nextUp(userId: string, limit = 1, ctx?: StudyContext): Promise<NextUpItem[]> {
  const { profile, plans, entitlement: ent } = ctx ?? (await loadStudyContext(userId));

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
