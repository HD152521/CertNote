import { describe, expect, test } from 'vitest';
import { isLanguageCookieAuthoritative, normalizeLanguage, resolveLanguage } from './i18n';

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
