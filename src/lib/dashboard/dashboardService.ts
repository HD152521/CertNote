import { DEFAULT_CATEGORY } from '../category';
import { listCerts, type CertMeta } from '../content';
import type { StudyContext } from '../personalization/context';
import { getAllQuestions, getQuestionById } from '../questions';
import { getAttemptService, ATTEMPT_HISTORY_LIMIT } from '../quiz/attemptService';
import type { AttemptRecord } from '../quiz/attemptRepository';
import { getReviewService } from '../review/factory';
import type { ReviewCounts } from '../review/types';

const RECENT_LIMIT = 8;

export interface CertProgress {
  slug: string;
  code: string;
  name: string;
  level: CertMeta['level'];
  accent: string;
  totalQuestions: number;
  attemptedQuestions: number; // 한 번이라도 푼 distinct 문제 수
  solvedQuestions: number; // 한 번이라도 맞힌 distinct 문제 수
  attempts: number;
  correct: number;
}

export interface RecentAttempt {
  questionId: string;
  slug: string;
  week: number;
  day: number;
  number: number;
  prompt: string;
  correct: boolean;
  attemptedAt: string;
}

// 도메인별 정답률(약점 분석용). domain 필드가 있는 문제(모의고사)만 집계된다.
export interface DomainStat {
  domain: string;
  attempts: number;
  correct: number;
  accuracy: number; // 0~100
}

// 자격증·주차별 정답률(약점 분석용). day 문제는 domain 태그가 없어 주차로 버킷한다.
// → 모의고사를 풀지 않아도(day 퀴즈만 풀어도) 약점 신호가 채워진다.
export interface TopicStat {
  slug: string;
  code: string;
  week: number;
  attempts: number;
  correct: number;
  accuracy: number; // 0~100
}

interface TopicAttempt {
  questionId: string;
  correct: boolean;
}

// day 문제(week>0)를 자격증·주차별로 집계해 약점순(정답률 낮은 순)으로 반환한다(순수).
// getQ/codeBySlug를 주입받아 DB 없이 단위테스트 가능(dashboardService IO와 분리).
export function buildTopicStats(
  attempts: TopicAttempt[],
  getQ: (id: string) => { slug: string; week: number } | undefined,
  codeBySlug: Map<string, string>,
): TopicStat[] {
  const agg = new Map<string, { slug: string; week: number; attempts: number; correct: number }>();
  for (const at of attempts) {
    const q = getQ(at.questionId);
    if (!q || q.week <= 0) continue; // 모의고사(week 0)는 domain 집계가 담당.
    const key = `${q.slug}#${q.week}`;
    const cur = agg.get(key) ?? { slug: q.slug, week: q.week, attempts: 0, correct: 0 };
    cur.attempts += 1;
    if (at.correct) cur.correct += 1;
    agg.set(key, cur);
  }
  return [...agg.values()]
    .map((t) => ({
      slug: t.slug,
      code: codeBySlug.get(t.slug) ?? t.slug,
      week: t.week,
      attempts: t.attempts,
      correct: t.correct,
      accuracy: Math.round((t.correct / t.attempts) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);
}

export interface DashboardData {
  attempts: number;
  correct: number;
  accuracy: number; // 0~100, 시도 기준
  attemptedQuestions: number;
  totalQuestions: number;
  coverage: number; // 0~100, 전체 문제 중 한 번이라도 푼 비율
  review: ReviewCounts;
  certs: CertProgress[];
  domains: DomainStat[]; // 모의고사 도메인별, 정답률 낮은 순(약점 우선)
  topics: TopicStat[]; // day 문제 자격증·주차별, 정답률 낮은 순(약점 우선)
  recent: RecentAttempt[];
}

interface CertAgg {
  attempted: Set<string>;
  solved: Set<string>;
  attempts: number;
  correct: number;
}

// 로그인 사용자의 학습 현황을 집계한다. 읽기 전용 — 서버 컴포넌트에서 호출.
export async function getDashboardData(
  userId: string,
  ctx?: Pick<StudyContext, 'attempts' | 'review' | 'certs'>,
): Promise<DashboardData> {
  let attemptList: AttemptRecord[];
  let review: ReviewCounts;
  let certs: CertMeta[];
  if (ctx) {
    ({ attempts: attemptList, review, certs } = ctx);
  } else {
    [attemptList, review, certs] = await Promise.all([
      getAttemptService().list(userId, ATTEMPT_HISTORY_LIMIT),
      getReviewService().stats(userId),
      listCerts(DEFAULT_CATEGORY),
    ]);
  }

  // 자격증별 전체 문제 수.
  const totalByCert = new Map<string, number>();
  for (const q of getAllQuestions()) {
    totalByCert.set(q.slug, (totalByCert.get(q.slug) ?? 0) + 1);
  }

  const aggByCert = new Map<string, CertAgg>();
  function agg(slug: string): CertAgg {
    let a = aggByCert.get(slug);
    if (!a) {
      a = { attempted: new Set(), solved: new Set(), attempts: 0, correct: 0 };
      aggByCert.set(slug, a);
    }
    return a;
  }

  let attempts = 0;
  let correct = 0;
  const attemptedAll = new Set<string>();
  const domainAgg = new Map<string, { attempts: number; correct: number }>();
  for (const at of attemptList) {
    const q = getQuestionById(at.questionId);
    if (!q) continue; // 삭제·재생성된 문제 id는 건너뜀
    attempts += 1;
    attemptedAll.add(at.questionId);
    const a = agg(q.slug);
    a.attempts += 1;
    a.attempted.add(at.questionId);
    if (at.correct) {
      correct += 1;
      a.correct += 1;
      a.solved.add(at.questionId);
    }
    // 도메인 집계(domain 있는 모의고사 문제만).
    if (q.domain) {
      const d = domainAgg.get(q.domain) ?? { attempts: 0, correct: 0 };
      d.attempts += 1;
      if (at.correct) d.correct += 1;
      domainAgg.set(q.domain, d);
    }
  }

  // 정답률 낮은 순(약점 우선). 동률은 시도 많은 순.
  const domains: DomainStat[] = [...domainAgg.entries()]
    .map(([domain, d]) => ({
      domain,
      attempts: d.attempts,
      correct: d.correct,
      accuracy: Math.round((d.correct / d.attempts) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);

  const certProgress: CertProgress[] = certs.map((c) => {
    const a = aggByCert.get(c.slug);
    return {
      slug: c.slug,
      code: c.code,
      name: c.name,
      level: c.level,
      accent: c.accent,
      totalQuestions: totalByCert.get(c.slug) ?? 0,
      attemptedQuestions: a ? a.attempted.size : 0,
      solvedQuestions: a ? a.solved.size : 0,
      attempts: a ? a.attempts : 0,
      correct: a ? a.correct : 0,
    };
  });

  const totalQuestions = getAllQuestions().length;

  // day 문제 주차별 약점(모의고사 없이도 채워지도록). 자격증 코드 매핑 주입.
  const codeBySlug = new Map(certs.map((c) => [c.slug, c.code]));
  const topics = buildTopicStats(
    attemptList.map((at) => ({ questionId: at.questionId, correct: at.correct })),
    getQuestionById,
    codeBySlug,
  );

  const recent: RecentAttempt[] = [];
  for (const at of attemptList.slice(0, RECENT_LIMIT)) {
    const q = getQuestionById(at.questionId);
    if (!q) continue;
    recent.push({
      questionId: at.questionId,
      slug: q.slug,
      week: q.week,
      day: q.day,
      number: q.number,
      prompt: q.prompt,
      correct: at.correct,
      attemptedAt: at.attemptedAt,
    });
  }

  return {
    attempts,
    correct,
    accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : 0,
    attemptedQuestions: attemptedAll.size,
    totalQuestions,
    coverage: totalQuestions > 0 ? Math.round((attemptedAll.size / totalQuestions) * 100) : 0,
    review,
    certs: certProgress,
    domains,
    topics,
    recent,
  };
}
