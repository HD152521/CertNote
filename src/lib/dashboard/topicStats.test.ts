import { describe, expect, it } from 'vitest';
import { buildTopicStats } from './dashboardService';

// 테스트용 문제 인덱스 픽스처.
const QUESTIONS: Record<string, { slug: string; week: number }> = {
  'saa-w1-1': { slug: 'saa-c03', week: 1 },
  'saa-w1-2': { slug: 'saa-c03', week: 1 },
  'saa-w2-1': { slug: 'saa-c03', week: 2 },
  'clf-w1-1': { slug: 'clf-c02', week: 1 },
  'exam-1': { slug: 'saa-c03', week: 0 }, // 모의고사 — 제외 대상
};
const getQ = (id: string) => QUESTIONS[id];
const codeBySlug = new Map([
  ['saa-c03', 'SAA-C03'],
  ['clf-c02', 'CLF-C02'],
]);

describe('buildTopicStats', () => {
  it('groups day questions by cert and week', () => {
    const stats = buildTopicStats(
      [
        { questionId: 'saa-w1-1', correct: true },
        { questionId: 'saa-w1-2', correct: false },
        { questionId: 'saa-w2-1', correct: true },
      ],
      getQ,
      codeBySlug,
    );
    const w1 = stats.find((s) => s.slug === 'saa-c03' && s.week === 1);
    expect(w1).toMatchObject({ code: 'SAA-C03', attempts: 2, correct: 1, accuracy: 50 });
    const w2 = stats.find((s) => s.slug === 'saa-c03' && s.week === 2);
    expect(w2).toMatchObject({ attempts: 1, correct: 1, accuracy: 100 });
  });

  it('sorts weakest (lowest accuracy) first, ties by more attempts', () => {
    const stats = buildTopicStats(
      [
        { questionId: 'saa-w1-1', correct: false }, // week1: 0%
        { questionId: 'saa-w1-2', correct: false },
        { questionId: 'saa-w2-1', correct: true }, // week2: 100%
      ],
      getQ,
      codeBySlug,
    );
    expect(stats[0].week).toBe(1); // 약점(0%)이 먼저
    expect(stats[0].accuracy).toBe(0);
  });

  it('excludes mock-exam questions (week 0)', () => {
    const stats = buildTopicStats([{ questionId: 'exam-1', correct: false }], getQ, codeBySlug);
    expect(stats).toEqual([]);
  });

  it('skips unknown question ids', () => {
    const stats = buildTopicStats([{ questionId: 'ghost', correct: true }], getQ, codeBySlug);
    expect(stats).toEqual([]);
  });

  it('falls back to slug when code is missing from the map', () => {
    const stats = buildTopicStats([{ questionId: 'clf-w1-1', correct: true }], getQ, new Map());
    expect(stats[0].code).toBe('clf-c02');
  });
});
