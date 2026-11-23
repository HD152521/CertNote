import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }), usePathname: () => '/' }));
vi.mock('@/lib/i18n-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/i18n')>('@/lib/i18n');
  return { useLanguage: () => 'ko', t: actual.t };
});

import { ProfileSection } from '@/components/account/ProfileSection';
import { ResendVerifyButton } from '@/components/auth/ResendVerifyButton';
import { ResumeReading } from '@/components/resume/ResumeReading';

// 짧은 상태 알림은 토스트 한 곳으로 나간다 — 컴포넌트 자신은 인라인 알림 요소를 그리지 않는다.
describe('토스트로 옮긴 컴포넌트', () => {
  test('ResumeReading 은 자체 알림 요소를 그리지 않는다', () => {
    expect(renderToStaticMarkup(createElement(ResumeReading, { href: '/aws/x/day1' }))).toBe('');
  });

  test('ResendVerifyButton 은 버튼만 그리고 인라인 알림(role)이 없다', () => {
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
