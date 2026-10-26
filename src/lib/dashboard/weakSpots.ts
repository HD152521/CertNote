import { DEFAULT_CATEGORY } from '../category';
import type { DomainStat, TopicStat } from './dashboardService';

// 대시보드 "약한 곳" 카드(순수). 모의고사 도메인 약점과 주차 퀴즈 약점을 한 목록으로 합쳐
// 정답률이 낮은 몇 개만 고른다 — 예전에는 약점 드릴·도메인별·주차별 세 군데에 나뉘어 있었다.

// 몇 문제 안 풀고 틀린 영역이 맨 위로 오지 않게 하는 최소 풀이 수.
export const MIN_WEAK_ATTEMPTS = 3;
export const WEAK_SPOT_LIMIT = 3;

export interface WeakSpot {
  key: string; // recommendService 의 버킷 키와 같은 형식(topic:slug#week / domain:이름)
  kind: 'domain' | 'topic';
  domain?: string;
  slug?: string;
  code?: string;
  week?: number;
  accuracy: number;
  attempts: number;
  href: string;
}

export function mergeWeakSpots(
  domains: readonly DomainStat[],
  topics: readonly TopicStat[],
  limit = WEAK_SPOT_LIMIT,
): WeakSpot[] {
  const all: WeakSpot[] = [
    ...domains.map((d) => ({
      key: `domain:${d.domain}`,
      kind: 'domain' as const,
      domain: d.domain,
      accuracy: d.accuracy,
      attempts: d.attempts,
      href: '/exam',
    })),
    ...topics.map((t) => ({
      key: `topic:${t.slug}#${t.week}`,
      kind: 'topic' as const,
      slug: t.slug,
      code: t.code,
      week: t.week,
      accuracy: t.accuracy,
      attempts: t.attempts,
      href: `/${DEFAULT_CATEGORY}/${t.slug}/week${t.week}/day1`,
    })),
  ];
  return all
    .filter((s) => s.attempts >= MIN_WEAK_ATTEMPTS && s.accuracy < 100)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, Math.max(0, limit));
}
