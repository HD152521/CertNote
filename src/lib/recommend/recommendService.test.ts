import { describe, expect, it } from 'vitest';
import type { DayRef } from '../content';
import {
  pickNextUp,
  selectDrillQuestions,
  type DrillCandidate,
  type WeakBucket,
} from './recommendService';

// ── selectDrillQuestions ────────────────────────────────────────────────────

// 버킷별 후보 문제 픽스처.
const POOL: Record<string, DrillCandidate[]> = {
  'topic:saa-c03#1': [
    { id: 'saa-w1-1', slug: 'saa-c03', week: 1, day: 1, number: 1, prompt: 'Q1' },
    { id: 'saa-w1-2', slug: 'saa-c03', week: 1, day: 1, number: 2, prompt: 'Q2' },
    { id: 'saa-w1-3', slug: 'saa-c03', week: 1, day: 2, number: 3, prompt: 'Q3' },
  ],
  'topic:saa-c03#2': [
    { id: 'saa-w2-1', slug: 'saa-c03', week: 2, day: 1, number: 1, prompt: 'Q4' },
    { id: 'saa-w2-2', slug: 'saa-c03', week: 2, day: 1, number: 2, prompt: 'Q5' },
  ],
};
const poolFor = (key: string): DrillCandidate[] => POOL[key] ?? [];

const bucket = (key: string, accuracy: number): WeakBucket => ({
  key,
  label: key,
  reason: 'topic',
  accuracy,
});

describe('selectDrillQuestions', () => {
  it('fills weakest bucket first', () => {
    const items = selectDrillQuestions(
      [bucket('topic:saa-c03#2', 60), bucket('topic:saa-c03#1', 20)],
      poolFor,
      new Set(),
      2,
    );
    // week1(20%)이 더 약해 먼저 채워짐.
    expect(items.map((i) => i.id)).toEqual(['saa-w1-1', 'saa-w1-2']);
    expect(items[0].bucketKey).toBe('topic:saa-c03#1');
  });

  it('respects the limit', () => {
    const items = selectDrillQuestions([bucket('topic:saa-c03#1', 20)], poolFor, new Set(), 2);
    expect(items).toHaveLength(2);
  });

  it('returns [] when limit <= 0', () => {
    expect(selectDrillQuestions([bucket('topic:saa-c03#1', 20)], poolFor, new Set(), 0)).toEqual([]);
  });

  it('excludes already-solved questions', () => {
    const items = selectDrillQuestions(
      [bucket('topic:saa-c03#1', 20)],
      poolFor,
      new Set(['saa-w1-1', 'saa-w1-2']),
      5,
    );
    expect(items.map((i) => i.id)).toEqual(['saa-w1-3']);
  });

  it('deduplicates a question shared across buckets', () => {
    const shared: DrillCandidate = { id: 'dup', slug: 'saa-c03', week: 1, day: 1, number: 9, prompt: 'D' };
    const local = (key: string) => (key === 'a' || key === 'b' ? [shared] : []);
    const items = selectDrillQuestions([bucket('a', 10), bucket('b', 20)], local, new Set(), 5);
    expect(items).toHaveLength(1);
  });

  it('spills into the next bucket after exhausting the weakest', () => {
    const items = selectDrillQuestions(
      [bucket('topic:saa-c03#1', 20), bucket('topic:saa-c03#2', 60)],
      poolFor,
      new Set(),
      5,
    );
    // week1의 3문제 + week2의 2문제 = 5개, 약점 순.
    expect(items.map((i) => i.id)).toEqual(['saa-w1-1', 'saa-w1-2', 'saa-w1-3', 'saa-w2-1', 'saa-w2-2']);
  });

  it('returns [] when every candidate is excluded', () => {
    const all = new Set(POOL['topic:saa-c03#1'].map((q) => q.id));
    expect(selectDrillQuestions([bucket('topic:saa-c03#1', 20)], poolFor, all, 5)).toEqual([]);
  });
});

// ── pickNextUp ───────────────────────────────────────────────────────────────

const dayRef = (slug: string, week: number, day: number): DayRef => ({
  category: 'aws-certs',
  slug,
  week,
  day,
  title: `${slug} W${week}D${day}`,
  href: `/aws-certs/${slug}/${week}/${day}`,
});

describe('pickNextUp', () => {
  it("recommends the plan's today portion when present", () => {
    const items = pickNextUp({
      todayItems: [dayRef('saa-c03', 2, 1), dayRef('saa-c03', 2, 2)],
      fallbackDay: dayRef('saa-c03', 1, 1),
      limit: 1,
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ week: 2, day: 1, reason: 'plan_today' });
  });

  it('caps today items at the limit', () => {
    const items = pickNextUp({
      todayItems: [dayRef('saa-c03', 2, 1), dayRef('saa-c03', 2, 2), dayRef('saa-c03', 2, 3)],
      fallbackDay: null,
      limit: 2,
    });
    expect(items).toHaveLength(2);
  });

  it('falls back to the first day (cold start) when no plan portion', () => {
    const items = pickNextUp({ todayItems: [], fallbackDay: dayRef('saa-c03', 1, 1), limit: 3 });
    expect(items).toEqual([
      { slug: 'saa-c03', week: 1, day: 1, title: 'saa-c03 W1D1', href: '/aws-certs/saa-c03/1/1', reason: 'start' },
    ]);
  });

  it('returns [] when there is nothing to recommend', () => {
    expect(pickNextUp({ todayItems: [], fallbackDay: null, limit: 3 })).toEqual([]);
  });

  it('returns [] when limit <= 0', () => {
    expect(pickNextUp({ todayItems: [dayRef('saa-c03', 1, 1)], fallbackDay: null, limit: 0 })).toEqual([]);
  });
});
