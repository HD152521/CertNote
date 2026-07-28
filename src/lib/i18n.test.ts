import { describe, expect, test } from 'vitest';
import { hreflangPair, isLanguageCookieAuthoritative, normalizeLanguage, resolveLanguage } from './i18n';

describe('normalizeLanguage', () => {
  test('accepts en', () => {
    expect(normalizeLanguage('en')).toBe('en');
  });

  test('falls back to ko for anything else', () => {
    for (const input of ['ko', 'EN', 'fr', '', null, undefined, 0, {}]) {
      expect(normalizeLanguage(input)).toBe('ko');
    }
  });
});

describe('resolveLanguage — indexed pages ignore the cookie', () => {
  // 크롤러와 사용자가 같은 URL에서 다른 언어를 보면 canonical/hreflang이 무의미해진다.
  test.each([
    ['/en', 'en'],
    ['/en/saa-c03', 'en'],
    ['/en/saa-c03/week1/day1', 'en'],
  ])('%s is always English', (path, expected) => {
    expect(resolveLanguage(path, 'ko')).toBe(expected);
    expect(resolveLanguage(path, 'en')).toBe(expected);
    expect(resolveLanguage(path, undefined)).toBe(expected);
  });

  // 이 경로들만 영어판 URL이 따로 있다: '/' ↔ '/en', '/aws-certs/*' ↔ '/en/*'
  test.each([
    ['/'],
    ['/aws-certs'],
    ['/aws-certs/saa-c03/week1/day1'],
  ])('%s is always Korean', (path) => {
    expect(resolveLanguage(path, 'en')).toBe('ko');
    expect(resolveLanguage(path, 'ko')).toBe('ko');
  });

  // 영어판 URL이 없는 공개 페이지는 쿠키를 따른다. 쿠키 없는 크롤러에겐 한국어가 나가 그대로 색인된다.
  test.each([['/pricing'], ['/privacy']])('%s follows the cookie, defaulting to Korean', (path) => {
    expect(resolveLanguage(path, undefined)).toBe('ko');
    expect(resolveLanguage(path, 'en')).toBe('en');
  });

  test('a slug merely starting with "en" is not the English category', () => {
    expect(resolveLanguage('/entitlements', 'ko')).toBe('ko');
    // 예전 detectLanguage는 startsWith('/en')만 봐서 이런 경로를 영어로 오판했다.
    expect(resolveLanguage('/enterprise/report', 'en')).toBe('en');
  });
});

describe('resolveLanguage — login-gated pages follow the cookie', () => {
  const gated = ['/dashboard', '/review', '/notebook', '/exam', '/account', '/admin', '/login', '/checkout'];

  test.each(gated)('%s honours an en cookie', (path) => {
    expect(resolveLanguage(path, 'en')).toBe('en');
  });

  test.each(gated)('%s defaults to Korean without a cookie', (path) => {
    expect(resolveLanguage(path, undefined)).toBe('ko');
  });

  test('a tampered cookie value degrades to Korean', () => {
    expect(resolveLanguage('/dashboard', 'de')).toBe('ko');
    expect(resolveLanguage('/dashboard', '<script>')).toBe('ko');
  });
});

describe('isLanguageCookieAuthoritative', () => {
  test('true only where the cookie can change the outcome', () => {
    expect(isLanguageCookieAuthoritative('/dashboard')).toBe(true);
    expect(isLanguageCookieAuthoritative('/account')).toBe(true);
  });

  test('false on pages whose language comes from the URL', () => {
    for (const path of ['/', '/en', '/en/saa-c03', '/aws-certs/saa-c03']) {
      expect(isLanguageCookieAuthoritative(path)).toBe(false);
    }
  });

  test('true on public pages that have no English URL', () => {
    expect(isLanguageCookieAuthoritative('/pricing')).toBe(true);
    expect(isLanguageCookieAuthoritative('/privacy')).toBe(true);
  });
});

describe('hreflangPair', () => {
  // (docs/SEO-indexing-fix-plan.md Step 3) hreflang 상호 참조의 단일 출처.
  // ko 페이지·en 페이지 양쪽이 반드시 같은 (koUrl, enUrl) 인자로 호출해야 상호 참조가 성립한다.
  test('ko/en 두 키를 그대로 담는다', () => {
    expect(hreflangPair('/aws-certs', '/en')).toEqual({ ko: '/aws-certs', en: '/en' });
  });

  test('x-default를 지정하지 않으면 키 자체가 없다', () => {
    expect(hreflangPair('/aws-certs', '/en')).not.toHaveProperty('x-default');
  });

  test('xDefault:true면 항상 ko URL을 가리킨다', () => {
    expect(hreflangPair('/aws-certs', '/en', { xDefault: true })).toEqual({
      ko: '/aws-certs',
      en: '/en',
      'x-default': '/aws-certs',
    });
  });

  test('두 페이지가 같은 인자로 호출하면 결과가 상호 참조·자기참조를 동시에 만족한다', () => {
    // ko 페이지(/aws-certs)와 en 페이지(/en)가 각자 자기 자신의 generateMetadata에서
    // 이 함수를 호출한다고 가정 — 인자만 같으면 결과 객체가 완전히 동일해야 한다.
    const fromKoPage = hreflangPair('/aws-certs', '/en', { xDefault: true });
    const fromEnPage = hreflangPair('/aws-certs', '/en', { xDefault: true });
    expect(fromKoPage).toEqual(fromEnPage);
    // 자기참조: ko 페이지 자신의 URL이 languages.ko에도 있고, en 페이지 자신의 URL이 languages.en에도 있다.
    expect(fromKoPage.ko).toBe('/aws-certs');
    expect(fromEnPage.en).toBe('/en');
  });
});
