import { describe, expect, test } from 'vitest';
import { footerInfoLinks, footerStudyLinks } from './footerLinks';

const BLOCKED = /^\/(en\/)?(login|signup|exam|dashboard|account|admin|api|checkout|pricing)(\/|$)/;

describe('footerLinks', () => {
  test('영어: 모든 링크가 /en 아래이고 한글 라벨이 없다', () => {
    const all = [...footerStudyLinks('en'), ...footerInfoLinks('en')];
    for (const l of all) {
      expect(l.href === '/en' || l.href.startsWith('/en/')).toBe(true);
      expect(l.label).not.toMatch(/[ㄱ-ㆎ가-힣]/);
    }
    const hrefs = all.map((l) => l.href);
    for (const h of ['/en', '/en/lab', '/en/roadmap', '/en/about', '/en/changelog', '/en/contact', '/en/privacy', '/en/terms']) {
      expect(hrefs).toContain(h);
    }
  });

  test('한국어: /en 링크가 없고 실습·로드맵·섹션 허브가 있다', () => {
    const hrefs = [...footerStudyLinks('ko'), ...footerInfoLinks('ko')].map((l) => l.href);
    expect(hrefs.some((h) => h === '/en' || h.startsWith('/en/'))).toBe(false);
    for (const h of ['/aws', '/linux', '/data', '/lab', '/roadmap', '/about', '/changelog', '/contact', '/privacy', '/terms']) {
      expect(hrefs).toContain(h);
    }
  });

  test('비공개·차단 경로는 링크하지 않는다', () => {
    for (const lang of ['ko', 'en'] as const) {
      for (const l of [...footerStudyLinks(lang), ...footerInfoLinks(lang)]) expect(l.href).not.toMatch(BLOCKED);
    }
  });

  test('링크 href 는 중복이 없다', () => {
    for (const lang of ['ko', 'en'] as const) {
      const hrefs = [...footerStudyLinks(lang), ...footerInfoLinks(lang)].map((l) => l.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });
});
