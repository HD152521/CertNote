import { describe, expect, it } from 'vitest';
import { authHref, authLangHint, isEnglishPath } from './authLang';

describe('authLangHint', () => {
  it('returns en for ?lang=en', () => {
    expect(authLangHint('en', null)).toBe('en');
  });
  it('returns en when next points at an English page', () => {
    expect(authLangHint(null, '/en/saa-c03/week1/day1')).toBe('en');
    expect(authLangHint(null, '/en')).toBe('en');
    expect(authLangHint(null, '/en?x=1')).toBe('en');
  });
  it('returns null for Korean pages, lookalikes, and missing values', () => {
    expect(authLangHint(null, '/exam?cert=sqld')).toBeNull();
    expect(authLangHint(null, '/english')).toBeNull();
    expect(authLangHint(null, '/enx/foo')).toBeNull();
    expect(authLangHint('ko', null)).toBeNull();
    expect(authLangHint('EN', null)).toBeNull();
    expect(authLangHint(null, null)).toBeNull();
  });
  it('ignores unsafe next values', () => {
    expect(authLangHint(null, '//evil.com/en/x')).toBeNull();
    expect(authLangHint(null, 'https://evil.com/en/x')).toBeNull();
    expect(authLangHint(null, '/\\evil.com')).toBeNull();
  });
});

describe('authHref', () => {
  it('leaves Korean links exactly as before', () => {
    expect(authHref('login', 'ko')).toBe('/login');
    expect(authHref('signup', 'ko', '/en/privacy')).toBe('/signup');
  });
  it('adds lang=en for English', () => {
    expect(authHref('signup', 'en')).toBe('/signup?lang=en');
  });
  it('carries the current English page as next', () => {
    expect(authHref('login', 'en', '/en/saa-c03/week2/day1')).toBe(
      '/login?lang=en&next=%2Fen%2Fsaa-c03%2Fweek2%2Fday1',
    );
  });
  it('never carries non-English or unsafe paths as next', () => {
    expect(authHref('login', 'en', '/pricing')).toBe('/login?lang=en');
    expect(authHref('login', 'en', '//evil.com')).toBe('/login?lang=en');
    expect(authHref('login', 'en', 'https://evil.com/en/x')).toBe('/login?lang=en');
  });
});

describe('isEnglishPath', () => {
  it('matches only /en and /en/...', () => {
    expect(isEnglishPath('/en')).toBe(true);
    expect(isEnglishPath('/en/lab')).toBe(true);
    expect(isEnglishPath('/endpoint')).toBe(false);
  });
});
