import { describe, expect, test } from 'vitest';
import { isAdEligiblePath, routePathFromSegments } from './adEligibility';

describe('isAdEligiblePath — 광고를 실어도 되는 경로', () => {
  test.each([
    '/',
    '/aws',
    '/aws/saa-c03',
    '/aws/saa-c03/week1/day1',
    '/aws/saa-c03/week2/day1',
    '/linux/linux-master-1',
    '/en',
    '/en/saa-c03/week1/day1',
    '/roadmap',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
  ])('공개 페이지 %s → true', (pathname) => {
    expect(isAdEligiblePath(pathname)).toBe(true);
  });

  test.each([
    // 로그인 전용
    '/dashboard',
    '/exam',
    '/exam/saa-c03',
    '/review',
    '/notebook',
    '/account',
    '/account/subscription',
    '/admin',
    '/admin/users',
    '/home',
    '/onboarding',
    '/welcome',
    // 인증
    '/login',
    '/signup',
    '/forgot',
    '/reset',
    '/verify',
    // 구독
    '/pricing',
    '/checkout',
    '/checkout/success',
  ])('제외 경로 %s → false', (pathname) => {
    expect(isAdEligiblePath(pathname)).toBe(false);
  });

  test('끝 슬래시·쿼리·해시가 붙어도 판정이 같다', () => {
    expect(isAdEligiblePath('/login/')).toBe(false);
    expect(isAdEligiblePath('/login?next=/dashboard')).toBe(false);
    expect(isAdEligiblePath('/account#profile')).toBe(false);
    expect(isAdEligiblePath('/aws/')).toBe(true);
  });

  test('첫 세그먼트가 통째로 일치할 때만 제외한다', () => {
    // /exam 은 제외지만 /examples 나 /aws/exam 은 다른 경로다.
    expect(isAdEligiblePath('/examples')).toBe(true);
    expect(isAdEligiblePath('/loginx')).toBe(true);
    expect(isAdEligiblePath('/aws/exam')).toBe(true);
    expect(isAdEligiblePath('/en/login')).toBe(true);
  });

  test('경로를 알 수 없으면 싣지 않는다', () => {
    expect(isAdEligiblePath(null)).toBe(false);
    expect(isAdEligiblePath(undefined)).toBe(false);
    expect(isAdEligiblePath('')).toBe(false);
    expect(isAdEligiblePath('login')).toBe(false);
  });
});

describe('routePathFromSegments — 레이아웃 세그먼트 → 라우트 경로', () => {
  test('세그먼트가 없으면 홈', () => {
    expect(routePathFromSegments([])).toBe('/');
  });

  test('세그먼트를 / 로 잇는다', () => {
    expect(routePathFromSegments(['aws', 'saa-c03', 'week1', 'day1'])).toBe('/aws/saa-c03/week1/day1');
  });

  test('라우트 그룹 (…) 은 URL 에 없으므로 뺀다', () => {
    expect(routePathFromSegments(['(auth)', 'login'])).toBe('/login');
  });

  test('proxy 가 / 를 /home 으로 rewrite 한 요청은 home 세그먼트로 잡혀 제외된다', () => {
    expect(isAdEligiblePath(routePathFromSegments(['home']))).toBe(false);
  });
});
