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

import { ToastList } from './Toast';

const noop = () => {};
function render(items: ToastItem[], lang: 'ko' | 'en' = 'ko') {
  return renderToStaticMarkup(createElement(ToastList, { items, lang, onDismiss: noop, onPause: noop, onResume: noop }));
}
const item = (over: Partial<ToastItem> = {}): ToastItem => ({ id: 1, message: '저장되었습니다.', tone: 'info', durationMs: 4000, ...over });

describe('ToastList', () => {
  test('일반 알림은 role=status, aria-live=polite', () => {
    const html = render([item()]);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('저장되었습니다.');
  });

  test('오류 알림은 role=alert', () => {
    const html = render([item({ tone: 'error' })]);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });

  test('닫기 버튼은 기존 close 문구를 접근성 이름으로 쓴다(ko·en)', () => {
    expect(render([item()])).toContain('aria-label="닫기"');
    expect(render([item()], 'en')).toContain('aria-label="Close"');
  });

  test('동작 버튼은 있을 때만 나온다', () => {
    expect(render([item()])).not.toContain('처음부터');
    expect(render([item({ action: { label: '처음부터', onAction: noop } })])).toContain('처음부터');
  });

  test('등장 모션은 toast-enter 클래스이고 CSS 에서 모션 허용일 때만 애니메이션한다', () => {
    expect(render([item()])).toContain('toast-enter');
    const css = readFileSync(resolve(__dirname, '../../app/globals.css'), 'utf8');
    const block = css.match(/@media \(prefers-reduced-motion: no-preference\) \{[^}]*\.toast-enter[^}]*\}/);
    expect(block).not.toBeNull();
    expect(css.replace(block![0], '')).not.toMatch(/\.toast-enter\s*\{[^}]*animation/);
  });
});
