import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { DayContent } from '@/lib/content';

// DayView 의 광고 슬롯 배치만 본다(docs/P3-adsense-readiness-plan.md Step 10). 본문·목차·추적 등 광고와
// 무관한 자식은 자리 표시로 바꿔, DayView 가 "어떤 조건에서 어느 슬롯을 그리는가"만 실제 코드로 검증한다.
// vi.mock 은 파일 맨 위로 끌어올려지므로 자리 표시도 vi.hoisted 로 만든다(문자열만 내는 컴포넌트).
const { stub } = vi.hoisted(() => ({ stub: (name: string) => () => `[[${name}]]` }));
vi.mock('next/navigation', () => ({ usePathname: () => '/aws/saa-c03/week2/day1' }));
vi.mock('next/link', () => ({
  default: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('@/lib/i18n-client', () => ({ useLanguage: () => 'ko' }));
vi.mock('@/lib/content', () => ({ previewOf: (source: string) => source }));
vi.mock('@/lib/day/structuredData', () => ({
  buildDayStructuredData: async () => ({ articleLd: null, breadcrumbLd: null }),
}));
vi.mock('@/components/Article', () => ({ Article: stub('article') }));
vi.mock('@/components/Paywall', () => ({ Paywall: stub('paywall') }));
vi.mock('@/components/day/SummaryCard', () => ({ SummaryCard: stub('summary') }));
vi.mock('@/components/Toc', () => ({ Toc: stub('toc') }));
vi.mock('@/components/MarkAsRead', () => ({ MarkAsRead: stub('mark-as-read') }));
vi.mock('@/components/study/ExamDateNudge', () => ({ ExamDateNudge: stub('nudge') }));
vi.mock('@/components/study/DayNavigationOverlay', () => ({ DayNavigationOverlay: stub('overlay') }));
vi.mock('@/components/analytics/LessonTracker', () => ({ LessonTracker: stub('tracker') }));
vi.mock('@/components/JsonLd', () => ({ JsonLd: stub('json-ld') }));

import { DayView } from './DayView';

const CONTENT = {
  title: 'Day 1 - 제목',
  body: '# 제목\n\n본문',
  href: '/aws/saa-c03/week2/day1',
  certMeta: { code: 'SAA-C03', level: 'associate' },
  prev: { href: '/aws/saa-c03/week1/day5', title: 'Day 5 - 이전', week: 1, day: 5 },
  next: { href: '/aws/saa-c03/week2/day2', title: 'Day 2 - 다음', week: 2, day: 2 },
} as unknown as DayContent;

function stubAds(slots: { top?: string; bottom?: string }) {
  vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', 'ca-pub-0000000000000000');
  vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_DAY_TOP', slots.top ?? '');
  vi.stubEnv('NEXT_PUBLIC_ADSENSE_SLOT_DAY_BOTTOM', slots.bottom ?? '');
}

async function renderDay(props: { category: string; w: number; locked?: boolean }): Promise<string> {
  const element = await DayView({
    category: props.category,
    slug: 'saa-c03',
    w: props.w,
    d: 1,
    lang: props.category === 'en' ? 'en' : 'ko',
    content: CONTENT,
    locked: props.locked ?? false,
    loggedIn: false,
  });
  return renderToStaticMarkup(element);
}

const slotIds = (html: string) => [...html.matchAll(/data-ad-slot="(\d+)"/g)].map((m) => m[1]);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('DayView — 광고 슬롯 배치', () => {
  test('색인 대상 문서에는 위 슬롯이 본문 앞, 아래 슬롯이 본문 뒤·이전/다음 앞에 온다', async () => {
    stubAds({ top: '1111111111', bottom: '2222222222' });

    const html = await renderDay({ category: 'aws', w: 2 });

    expect(slotIds(html)).toEqual(['1111111111', '2222222222']);
    const top = html.indexOf('data-ad-slot="1111111111"');
    const article = html.indexOf('[[article]]');
    const bottom = html.indexOf('data-ad-slot="2222222222"');
    const footer = html.indexOf('<footer');
    expect(top).toBeLessThan(article);
    expect(article).toBeLessThan(bottom);
    expect(bottom).toBeLessThan(footer);
  });

  test('영어판 2주차 이상(noindex)에는 슬롯 ID 가 있어도 위·아래 어느 슬롯도 그리지 않는다', async () => {
    stubAds({ top: '1111111111', bottom: '2222222222' });

    const html = await renderDay({ category: 'en', w: 2 });

    expect(slotIds(html)).toEqual([]);
    expect(html).not.toMatch(/adsbygoogle/);
  });

  test('영어판 1주차(색인 대상)에는 둘 다 그린다', async () => {
    stubAds({ top: '1111111111', bottom: '2222222222' });

    expect(slotIds(await renderDay({ category: 'en', w: 1 }))).toEqual(['1111111111', '2222222222']);
  });

  test('잠긴 화면에는 어느 슬롯도 그리지 않는다', async () => {
    stubAds({ top: '1111111111', bottom: '2222222222' });

    expect(slotIds(await renderDay({ category: 'aws', w: 2, locked: true }))).toEqual([]);
  });

  test('슬롯 ID 가 하나만 있으면 그 자리만 그린다', async () => {
    stubAds({ bottom: '2222222222' });

    expect(slotIds(await renderDay({ category: 'aws', w: 2 }))).toEqual(['2222222222']);
  });

  test('환경변수가 없으면 광고 마크업이 전혀 없다', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', '');

    expect(await renderDay({ category: 'aws', w: 2 })).not.toMatch(/adsbygoogle|<ins|<aside/);
  });
});

// docs/P4-trust-quality-plan.md Step 5a — 메타 줄은 광고와 무관하지만 DayView 를 그대로 렌더하는 곳이 여기라 함께 둔다.
describe('DayView — 출처·검수 메타 줄', () => {
  test('본문 앞에 기준·오류 제보 줄을 렌더하고, 검수 기록이 없으면 날짜를 싣지 않는다', async () => {
    const html = await renderDay({ category: 'aws', w: 2 });
    const line = html.indexOf('기준: SAA-C03 시험 가이드');
    expect(line).toBeGreaterThan(-1);
    expect(line).toBeLessThan(html.indexOf('[[article]]'));
    expect(html).toContain('오류 제보');
    // content/review-log.json 은 빈 배열로 시작한다 — 날짜가 표시되는 노트 0개가 정상.
    expect(html).not.toContain('마지막 검수');
  });
});
