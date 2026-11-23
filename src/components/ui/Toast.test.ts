import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import type { ToastItem } from '@/lib/toast';

vi.mock('@/lib/i18n-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/i18n')>('@/lib/i18n');
  return { useLanguage: () => 'ko', t: actual.t };
});

import { ToastList, ToastViewport } from './Toast';

const noop = () => {};
function render(items: ToastItem[], lang: 'ko' | 'en' = 'ko') {
  return renderToStaticMarkup(createElement(ToastList, { items, lang, onDismiss: noop, onPause: noop, onResume: noop }));
}
const item = (over: Partial<ToastItem> = {}): ToastItem => ({ id: 1, message: '저장되었습니다.', tone: 'info', durationMs: 4000, ...over });

describe('ToastViewport', () => {
  test('토스트가 없어도 빈 live region 두 개(polite status / assertive alert)가 항상 있다', () => {
    const html = renderToStaticMarkup(createElement(ToastViewport));
    expect(html).toMatch(/<div role="status" aria-live="polite"[^>]*><\/div>/);
    expect(html).toMatch(/<div role="alert" aria-live="assertive"[^>]*><\/div>/);
  });
});

describe('ToastList', () => {
  test('개별 토스트에는 role·aria-live 를 달지 않는다(컨테이너가 맡는다)', () => {
    const html = render([item(), item({ id: 2, message: 'e', tone: 'error' })]);
    expect(html).not.toMatch(/role=|aria-live=/);
    expect(html).toContain('data-tone="error"');
  });

  test('닫기 버튼은 기존 close 문구를 접근성 이름으로 쓴다(ko·en)', () => {
    expect(render([item()])).toContain('aria-label="닫기"');
    expect(render([item()], 'en')).toContain('aria-label="Close"');
  });

  test('동작 버튼은 있을 때만 나온다', () => {
    expect(render([item()])).not.toContain('처음부터');
    expect(render([item({ action: { label: '처음부터', onAction: noop } })])).toContain('처음부터');
  });

  test('detail 이 있으면 한 줄 말줄임(truncate)으로 이어 붙인다', () => {
    const html = render([item({ message: '이어 보는 중', detail: '긴 소제목' })]);
    expect(html).toContain('truncate');
    expect(html).toContain('긴 소제목');
    expect(render([item()])).not.toContain('truncate');
  });

  test('등장 모션은 toast-enter 클래스이고 CSS 에서 모션 허용일 때만 애니메이션한다', () => {
    expect(render([item()])).toContain('toast-enter');
    const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8');
    const block = css.match(/@media \(prefers-reduced-motion: no-preference\) \{[^}]*\.toast-enter[^}]*\}/);
    expect(block).not.toBeNull();
    expect(css.replace(block![0], '')).not.toMatch(/\.toast-enter\s*\{[^}]*animation/);
  });
});
