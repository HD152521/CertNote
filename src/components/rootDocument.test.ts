import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

// next/font 로더는 vitest(node)에서 실행되지 않고, 아래 자식들은 이 시험과 무관한 클라이언트·서버 전용 모듈이다.
vi.mock('@/lib/rootFonts', () => ({
  inter: { variable: 'inter' },
  d2Latin: { variable: 'd2l' },
  d2Korean: { variable: 'd2k' },
}));
const { passThrough } = vi.hoisted(() => ({ passThrough: ({ children }: { children: unknown }) => children }));
vi.mock('@/components/ThemeProvider', () => ({ ThemeProvider: passThrough }));
vi.mock('@/components/AppShell', () => ({ AppShell: passThrough }));
vi.mock('@/components/analytics/PostHogProvider', () => ({ PostHogProvider: passThrough }));
vi.mock('@/components/HtmlLangSync', () => ({ HtmlLangSync: () => null }));
vi.mock('@/components/ServiceWorkerRegister', () => ({ ServiceWorkerRegister: () => null }));
vi.mock('@/components/ads/AdSenseLoader', () => ({ AdSenseLoader: () => null }));
vi.mock('@/components/JsonLd', () => ({ JsonLd: () => null }));
vi.mock('@/lib/content', () => ({ listCerts: async () => [] }));

import { RootHtml } from './RootDocument';

// Step 3(docs/growth/next-work-plan-2026-11-14.md): 서버가 내보내는 <html lang> 은 라우트 그룹의 루트 레이아웃이 정한다.
describe('RootHtml — 서버 렌더 <html lang>', () => {
  test.each([['ko'], ['en']] as const)('lang=%s 이면 <html lang="%s"> 로 렌더된다', (lang) => {
    const html = renderToStaticMarkup(RootHtml({ lang, certs: [], children: createElement('main', null, 'x') }));
    expect(html).toMatch(new RegExp(`^<html lang="${lang}"`));
  });
});
