import { beforeAll, describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';
import { SESSION_COOKIE, createSessionToken } from '@/lib/auth/session';
import { proxy } from './proxy';

// 홈 분기(docs/P3-step3-speed-report.md). 홈(/)은 정적 랜딩으로 캐시되고, 유효한 세션 쿠키가
// 있는 요청만 proxy 가 학습 홈(/home, 동적)으로 rewrite 한다. 주소창은 그대로 `/` 다.
const ORIGIN = 'https://cert.juganlab.com';
const REWRITE_HEADER = 'x-middleware-rewrite';

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : undefined);
}

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-16-chars';
});

describe('proxy — 홈(/) 분기', () => {
  test('세션 쿠키가 없으면 rewrite 하지 않는다(정적 랜딩이 그대로 나간다)', async () => {
    const res = await proxy(request('/'));

    expect(res.headers.get(REWRITE_HEADER)).toBeNull();
    expect(res.headers.get('location')).toBeNull();
  });

  test('유효한 세션 쿠키가 있으면 학습 홈으로 rewrite 한다', async () => {
    const token = await createSessionToken({ sub: 'u1', email: 'a@b.c', role: 'user', ver: 0 });

    const res = await proxy(request('/', `${SESSION_COOKIE}=${token}`));

    expect(res.headers.get(REWRITE_HEADER)).toBe(`${ORIGIN}/home`);
  });

  test('위조·만료된 세션 쿠키는 비로그인으로 본다', async () => {
    const res = await proxy(request('/', `${SESSION_COOKIE}=not-a-jwt`));

    expect(res.headers.get(REWRITE_HEADER)).toBeNull();
    expect(res.headers.get('location')).toBeNull();
  });

  test('/home 을 직접 열면 홈으로 돌려보낸다(내부 전용 경로)', async () => {
    const res = await proxy(request('/home'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/`);
  });

  test('로그인 전용 경로는 여전히 /login 으로 보낸다', async () => {
    const res = await proxy(request('/dashboard'));

    expect(res.headers.get('location')).toBe(`${ORIGIN}/login?next=%2Fdashboard`);
  });
});
