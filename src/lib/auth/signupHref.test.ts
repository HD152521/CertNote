import { describe, expect, it } from 'vitest';
import { signupHref } from './signupHref';

describe('signupHref', () => {
  it('uses authHref for English (lang=en + English next)', () => {
    expect(signupHref('en', '/en/saa-c03/week1/day1')).toBe('/signup?lang=en&next=%2Fen%2Fsaa-c03%2Fweek1%2Fday1');
  });
  it('carries the exam page as next for English', () => {
    expect(signupHref('en', '/exam?cert=saa-c03')).toBe('/signup?lang=en&next=%2Fexam%3Fcert%3Dsaa-c03');
  });
  it('carries the Korean page as next', () => {
    expect(signupHref('ko', '/aws/saa-c03/week1/day1')).toBe('/signup?next=%2Faws%2Fsaa-c03%2Fweek1%2Fday1');
  });
  it('omits next for home and for missing paths', () => {
    expect(signupHref('ko', '/')).toBe('/signup');
    expect(signupHref('ko', null)).toBe('/signup');
  });
  it('drops unsafe next values', () => {
    expect(signupHref('ko', '//evil.com')).toBe('/signup');
    expect(signupHref('ko', 'https://evil.com/x')).toBe('/signup');
    expect(signupHref('ko', '/\\evil.com')).toBe('/signup');
    expect(signupHref('en', '//evil.com')).toBe('/signup?lang=en');
  });
});
