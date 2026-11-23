// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

const toast = vi.hoisted(() => ({ showToast: vi.fn(() => 42), dismissToast: vi.fn() }));
vi.mock('@/lib/toast', () => toast);
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }), usePathname: () => '/' }));
vi.mock('@/lib/i18n-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/i18n')>('@/lib/i18n');
  return { useLanguage: () => 'ko', t: actual.t };
});

import { ProfileSection } from '@/components/account/ProfileSection';
import { ResendVerifyButton } from '@/components/auth/ResendVerifyButton';
import { ResumeReading } from '@/components/resume/ResumeReading';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (rel: string) => readFileSync(resolve(__dirname, '../../..', rel), 'utf8');

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  window.localStorage.clear();
});

describe('토스트로 옮긴 컴포넌트 — 인라인 알림 요소가 없다', () => {
  test('ResumeReading 은 자체 알림 요소를 그리지 않는다', () => {
    expect(renderToStaticMarkup(createElement(ResumeReading, { href: '/aws/x/day1' }))).toBe('');
  });

  test('ResendVerifyButton 은 처음에 버튼만 그린다(성공 문구는 발송 뒤 인라인)', () => {
    const html = renderToStaticMarkup(createElement(ResendVerifyButton));
    expect(html).toContain('<button');
    expect(html).not.toMatch(/role="(status|alert)"/);
  });

  test('ProfileSection 은 저장 버튼을 유지하고 인라인 알림이 없다', () => {
    const initial = { name: 'a', birthdate: '2000-01-01', occupation: '', targetCert: '', purpose: '', experienceLevel: '' };
    const html = renderToStaticMarkup(createElement(ProfileSection, { certs: [], initial }));
    expect(html).toContain('type="submit"');
    expect(html).not.toMatch(/role="(status|alert)"/);
  });
});

describe('showToast 호출', () => {
  test('ProfileSection·ChangePasswordForm·ResendVerifyButton 이 알림을 토스트로 보낸다', () => {
    const profile = read('src/components/account/ProfileSection.tsx');
    expect(profile).toContain('showToast({ message: s.profileSaved })');
    expect(profile).toContain("tone: 'error', durationMs: data.message ? 0 : undefined");
    const forms = read('src/app/(ko)/account/AccountForms.tsx');
    expect(forms).toContain('showToast({ message: s.passwordUpdated })');
    expect(forms).toContain("passwordChangeFailed, tone: 'error', durationMs: data.message ? 0 : undefined");
    const resend = read('src/components/auth/ResendVerifyButton.tsx');
    expect(resend).toContain('s.resendRateLimited : s.resendFailed');
    expect(resend).not.toContain('message: s.resendSent');
  });

  test('ResendVerifyButton: 발송 성공은 인라인 status 로 남고 토스트는 없다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, status: 200 }));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(createElement(ResendVerifyButton)); });
    await act(async () => { (host.querySelector('button') as HTMLButtonElement).click(); });
    expect(host.querySelector('p[role="status"]')).not.toBeNull();
    expect((host.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
    expect(toast.showToast).not.toHaveBeenCalled();
    await act(async () => { root.unmount(); });
  });

  test('ResendVerifyButton: 제한(429)은 오류 토스트로 가고 인라인 문구는 없다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 429 }));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(createElement(ResendVerifyButton)); });
    await act(async () => { (host.querySelector('button') as HTMLButtonElement).click(); });
    expect(toast.showToast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
    expect(host.querySelector('p[role="status"]')).toBeNull();
    await act(async () => { root.unmount(); });
  });
});

describe('ResumeReading 토스트', () => {
  test('이어 읽기 이동 시 토스트를 띄우고, 언마운트하면 닫는다', async () => {
    document.body.innerHTML = '<div class="article"><h2 id="sec">소제목</h2></div>';
    const key = /KEY = '([^']+)'/.exec(read('src/lib/readingPosition.ts'))?.[1] ?? '';
    window.localStorage.setItem(
      key,
      JSON.stringify({ '/aws/x/day1': { headingId: 'sec', headingText: '소제목', ratio: 0.5, within: 0, at: 1 } }),
    );
    // jsdom 에는 글꼴 API·스크롤 이동이 없다 — 이동은 성공한 것으로 본다.
    Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() }, configurable: true });
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(createElement(ResumeReading, { href: '/aws/x/day1' })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(toast.showToast).toHaveBeenCalledTimes(1);
    expect(toast.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: '읽던 곳에서 이어 보는 중', detail: '소제목', durationMs: 6000 }),
    );
    await act(async () => { root.unmount(); });
    expect(toast.dismissToast).toHaveBeenCalledWith(42);
  });
});
