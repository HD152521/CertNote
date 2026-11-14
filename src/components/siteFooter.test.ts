import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import type { Language } from '@/lib/i18n';

const state = vi.hoisted(() => ({ lang: 'ko' as 'ko' | 'en' }));
vi.mock('@/lib/i18n-client', () => ({ useLanguage: () => state.lang }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => createElement('a', { href }, children as never),
}));

import { SiteFooter } from './SiteFooter';

const render = (lang: Language) => {
  state.lang = lang;
  return renderToStaticMarkup(createElement(SiteFooter));
};

// Step 4: 푸터 브랜드는 영어 페이지에서 영문 표기다.
describe('SiteFooter 운영자 표기', () => {
  test('영어: Jugan Labs, 한글 0자', () => {
    const html = render('en');
    expect(html).toContain('Jugan Labs');
    expect(html).not.toMatch(/[ㄱ-ㆎ가-힣]/);
  });

  test('한국어: 주간랩스 그대로', () => {
    const html = render('ko');
    expect(html).toContain('주간랩스');
    expect(html).not.toContain('Jugan Labs');
  });
});
