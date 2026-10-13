import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { shellStrings } from '@/lib/strings/shell';
import { TutorUnverifiedNotice } from './TutorUnverifiedNotice';

// useLanguage() 는 usePathname 을 쓴다 — 서버 렌더에서는 경로가 없으므로 한국어 기본 경로로 고정한다.
vi.mock('next/navigation', () => ({ usePathname: () => '/aws/saa-c03/week1/day1' }));

const KO = shellStrings.ko;
const base = { onRetry: () => {}, checking: false, stillUnverified: false };

function html(over: Partial<Parameters<typeof TutorUnverifiedNotice>[0]> = {}): string {
  return renderToStaticMarkup(createElement(TutorUnverifiedNotice, { ...base, ...over }));
}

describe('TutorUnverifiedNotice 렌더링', () => {
  it('기본 상태: 안내와 두 버튼만 있고 오류 문구(role=alert)는 없다', () => {
    const out = html();
    expect(out).toContain(KO.tutorUnverifiedTitle);
    expect(out).toContain(KO.tutorResend);
    expect(out).toContain(KO.tutorVerifiedRetry);
    expect(out).not.toContain('role="alert"');
  });

  it('retryError 가 있으면 그 문구를 alert 로 보여준다(429·502·503 거절)', () => {
    const out = html({ retryError: KO.tutorRateLimited });
    expect(out).toMatch(/role="alert"[^>]*>[^<]*요청이 많아요/);
    expect(out).toContain(KO.tutorRateLimited);
  });

  it('stillUnverified 이면 "아직 미인증" 문구를 보이고 retryError 는 가린다', () => {
    const out = html({ stillUnverified: true, retryError: KO.tutorRateLimited });
    expect(out).toContain(KO.tutorStillUnverified);
    expect(out).not.toContain(KO.tutorRateLimited);
  });

  it('checking 중에는 재시도 버튼이 비활성화되고 오류 문구가 숨겨진다', () => {
    const out = html({ checking: true, stillUnverified: true, retryError: KO.tutorRateLimited });
    expect(out).toContain(KO.tutorThinking);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*생각 중/);
    expect(out).not.toContain(KO.tutorStillUnverified);
    expect(out).not.toContain(KO.tutorRateLimited);
  });

  it('retryError 가 null 이면 오류 문구가 없다', () => {
    expect(html({ retryError: null })).not.toContain('role="alert"');
  });
});
