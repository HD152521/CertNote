import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/aws/saa-c03' as string | null }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('@/lib/i18n-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/i18n')>('@/lib/i18n');
  return { useLanguage: () => 'ko', t: actual.t };
});

import { FeedbackWidget } from './FeedbackWidget';
import { shellStrings } from '@/lib/strings/shell';

describe('FeedbackWidget 버튼', () => {
  test('접근성 이름(aria-label)을 유지하고 라벨은 sm 이상에서만 보인다', () => {
    nav.pathname = '/aws/saa-c03';
    const html = renderToStaticMarkup(createElement(FeedbackWidget));
    expect(html).toContain(`aria-label="${shellStrings.ko.feedbackOpen}"`);
    expect(html).toMatch(/<span class="hidden sm:inline">/);
    expect(html).toContain(shellStrings.ko.feedbackButton);
  });

  test('모바일 터치 영역은 44px(h-11 w-11), 눈에 보이는 원은 32px', () => {
    nav.pathname = '/';
    const html = renderToStaticMarkup(createElement(FeedbackWidget));
    expect(html).toContain('h-11 w-11');
    expect(html).toContain('h-8 w-8');
  });

  test('모의고사·복습 세션에서는 그리지 않는다', () => {
    nav.pathname = '/exam';
    expect(renderToStaticMarkup(createElement(FeedbackWidget))).toBe('');
    nav.pathname = '/review';
    expect(renderToStaticMarkup(createElement(FeedbackWidget))).toBe('');
  });
});
