import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { DayRef } from '@/lib/content';
import type { CertProgress } from '@/lib/dashboard/dashboardService';
import { TodayCard, type TodayPlanView } from './TodayCard';
import { ProgressCard } from './ProgressCard';
import { WeakSpotsCard } from './WeakSpotsCard';

const day = (week: number, d: number, title: string): DayRef =>
  ({ category: 'aws-certs', slug: 'saa-c03', week, day: d, title, href: `/aws-certs/saa-c03/week${week}/day${d}` }) as DayRef;

const plan: TodayPlanView = {
  certCode: 'SAA-C03',
  certName: 'Solutions Architect – Associate',
  examDate: '2026-12-14',
  dday: 49,
  items: [day(3, 3, 'Day 3 - S3 스토리지 클래스'), day(3, 4, 'Day 4 - S3 보안')],
  finished: false,
  perDay: 2,
  catchUp: { isBehind: true, behindBy: 3, perDay: 2, basePerDay: 1 },
};

const saa: CertProgress = {
  slug: 'saa-c03',
  code: 'SAA-C03',
  name: 'SAA',
  level: 'associate' as CertProgress['level'],
  accent: '#0f766e',
  totalQuestions: 980,
  attemptedQuestions: 418,
  solvedQuestions: 312,
  attempts: 500,
  correct: 375,
};

describe('TodayCard', () => {
  test('플랜이 있으면 D-day·밀린 분량·오늘 노트·이어서 읽기·복습 버튼', () => {
    const html = renderToStaticMarkup(TodayCard({ lang: 'ko', plan, starter: null, reviewDue: 7 }));
    expect(html).toContain('D-49');
    expect(html).toContain('<b>3개</b>');
    expect(html).toContain('S3 스토리지 클래스');
    expect(html).not.toContain('Day 3 -');
    expect(html).toContain('이어서 읽기 · W3D3');
    expect(html).toContain('href="/aws-certs/saa-c03/week3/day3"');
    expect(html).toContain('복습 7문제 시작');
    expect(html).toContain('href="/dashboard/goal"');
  });

  test('복습할 게 없으면 복습 버튼을 숨긴다', () => {
    expect(renderToStaticMarkup(TodayCard({ lang: 'ko', plan, starter: null, reviewDue: 0 }))).not.toContain('복습');
  });

  test('플랜이 없으면 목표 정하기와 첫 노트', () => {
    const html = renderToStaticMarkup(
      TodayCard({ lang: 'ko', plan: null, starter: { title: 'Day 1 - 클라우드 개념', href: '/aws-certs/clf-c02/week1/day1' }, reviewDue: 0 }),
    );
    expect(html).toContain('목표 정하기');
    expect(html).toContain('여기서 시작 · 클라우드 개념');
  });
});

describe('ProgressCard', () => {
  test('진행 막대 범례와 준비도, 근거 링크', () => {
    const html = renderToStaticMarkup(
      ProgressCard({ lang: 'ko', focus: saa, readiness: { state: 'behind', probability: 61 }, others: [] }),
    );
    expect(html).toContain('SAA-C03 어디까지 왔나');
    expect(html).toContain('맞힘 312');
    expect(html).toContain('아직 못 맞힘 106');
    expect(html).toContain('안 푼 문제 562');
    expect(html).toContain('61%');
    expect(html).toContain('조금 늦음');
    expect(html).toContain('href="/dashboard/readiness"');
  });

  test('예측 전이면 숫자 대신 몇 문제 더 풀면 되는지', () => {
    const html = renderToStaticMarkup(
      ProgressCard({ lang: 'ko', focus: { ...saa, attemptedQuestions: 12, solvedQuestions: 8 }, readiness: { state: 'pending', probability: 10 }, others: [] }),
    );
    expect(html).toContain('예측 전');
    expect(html).toContain('8문제 더 풀면 계산해요');
    expect(html).not.toContain('href="/dashboard/readiness"');
  });

  test('푼 문제가 없으면 안내 문구', () => {
    const html = renderToStaticMarkup(ProgressCard({ lang: 'en', focus: null, readiness: { state: 'pending', probability: 0 }, others: [] }));
    expect(html).toContain('No questions solved yet');
  });
});

describe('WeakSpotsCard', () => {
  test('약한 곳마다 정답률과 이동 버튼', () => {
    const html = renderToStaticMarkup(
      WeakSpotsCard({
        lang: 'ko',
        spots: [
          { key: 'domain:복원력', kind: 'domain', domain: '복원력', accuracy: 54, attempts: 28, href: '/exam' },
          { key: 'topic:saa-c03#5', kind: 'topic', slug: 'saa-c03', code: 'SAA-C03', week: 5, accuracy: 58, attempts: 19, href: '/aws-certs/saa-c03/week5/day1' },
        ],
      }),
    );
    expect(html).toContain('54%');
    expect(html).toContain('모의고사로 연습');
    expect(html).toContain('SAA-C03 · 5주차');
    expect(html).toContain('5주차 다시 보기');
    expect(html).toContain('href="/notebook"');
  });

  test('없으면 안내 문구', () => {
    expect(renderToStaticMarkup(WeakSpotsCard({ lang: 'ko', spots: [] }))).toContain('2문제 넘게');
  });
});
