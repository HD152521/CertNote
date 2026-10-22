import { describe, expect, test } from 'vitest';
// @ts-expect-error -- Next 내부 컴파일 모듈(타입 선언 없음). Next 가 matcher 를 컴파일하는 것과 같은 함수를 쓴다.
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp';
import { config } from '@/proxy';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { classifyPath, REAL_FOUR_SEGMENT_API_ROUTES } from './proxyRouting';

// Next 가 proxy matcher 를 컴파일하는 방식(path-to-regexp)으로 config.matcher 를 컴파일해, 빌드 없이
// "이 경로가 proxy 를 거치는가"를 판정한다. matcher 가 좁아지면(예: day 철자 한정) 아래 표가 실패한다.
const matchers: RegExp[] = (config.matcher as string[]).map((m) => pathToRegexp(m));
const reachesProxy = (p: string) => matchers.some((re) => re.test(p));

// 렌더 전에 막혀야 하는(= 캐시 가능한 200 이 되면 안 되는) 경로. 철자가 아니라 구조로 막는다.
const INVALID = [
  '/foo/bar/week2/day1',
  '/foo/bar/baz/qux',
  '/foo/bar/Week2/day1',
  '/foo/bar/week2/Day1',
  '/foo/bar/week1/x',
  '/zzz/saa-c03/week5/day3',
  '/AWS/saa-c03/week2/day1',
  '/LINUX/linux-master-1/week2/day1',
  '/AWS',
  '/Linux/linux-master-1',
  '/EN/saa-c03',
  '/apidocs/b/c/d',
  '/x/y/z/w',
  '/api/foo/bar/baz', // api/_next 네임스페이스의 알 수 없는 4세그먼트도 (라우터가 매칭 못 하게 하는 것과 별개로) 여기서 거른다
  '/api/auth/google/nope',
  '/api/x/week2/day1',
  '/_next/foo/bar/baz',
];

describe('proxy — 존재할 수 없는 경로는 반드시 proxy 를 거쳐 404 로 분류된다', () => {
  test.each(INVALID)('%s', (p) => {
    expect(reachesProxy(p), `${p} 가 matcher 에 안 걸림 → 렌더·캐시(200 소프트 404)로 직행`).toBe(true);
    expect(classifyPath(p)).toBe('not-found');
  });
});

describe('proxy — 콘텐츠 접두사는 존재 검증(content)으로 간다', () => {
  test.each([
    '/aws/saa-c03/week2/day1',
    '/aws/saa-c03/week2/day1/extra',
    '/linux/linux-master-2/week3/day2',
    '/en/saa-c03/week1/day1',
    '/aws/reviews/saa-c03',
    '/aws',
  ])('%s', (p) => {
    expect(reachesProxy(p)).toBe(true);
    expect(classifyPath(p)).toBe('content');
  });
});

describe('proxy — 무관한 실제 라우트는 가로채지 않는다(proxy 를 안 거치거나 pass/auth)', () => {
  test.each([
    '/api/auth/google/callback', // 4세그먼트 실제 API
    '/api/account/password/setup', // 4세그먼트 실제 API(구글 가입자 비밀번호 설정)
    '/api/auth/me',
    '/api/search',
    '/_next/static/chunks/abc.js',
    '/_next/image',
    '/_next/static/media/font.woff2',
    '/roadmap/solutions-architect',
    '/roadmap',
    '/login',
    '/sitemap.xml',
    '/icons/apple-touch-icon.png',
    '/monitoring',
  ])('%s', (p) => {
    if (reachesProxy(p)) expect(['pass', 'auth']).toContain(classifyPath(p));
    expect(classifyPath(p)).not.toBe('not-found');
    expect(classifyPath(p)).not.toBe('content');
  });

  test.each(['/account', '/account/subscription', '/dashboard', '/admin/users', '/exam/x/y/z'])('%s 은 로그인 게이트', (p) => {
    expect(classifyPath(p)).toBe('auth');
  });
});

describe('proxy — 실제 4세그먼트 API 목록은 파일시스템과 일치한다', () => {
  test('src/app/api 의 route.ts 중 URL 깊이 4 이상인 것 == REAL_FOUR_SEGMENT_API_ROUTES', async () => {
    const root = path.join(process.cwd(), 'src', 'app', 'api');
    const found: string[] = [];
    async function walk(dir: string) {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.name === 'route.ts') {
          const url = '/api/' + path.relative(root, path.dirname(full)).split(path.sep).join('/');
          if (url.split('/').filter(Boolean).length >= 4) found.push(url);
        }
      }
    }
    await walk(root);
    expect(found.sort()).toEqual([...REAL_FOUR_SEGMENT_API_ROUTES].sort());
  });
});

describe('classifyPath — 홈 분기', () => {
  test('/ 은 home, /home 은 study-home 이고 둘 다 proxy 를 거친다', () => {
    expect(reachesProxy('/')).toBe(true);
    expect(reachesProxy('/home')).toBe(true);
    expect(classifyPath('/')).toBe('home');
    expect(classifyPath('/home')).toBe('study-home');
  });
});

describe('classifyPath — 세그먼트 구조 판정', () => {
  test('4세그먼트 비콘텐츠는 not-found, 그 외 깊이는 pass', () => {
    expect(classifyPath('/a/b/c/d')).toBe('not-found');
    expect(classifyPath('/a/b/c')).toBe('pass');
    expect(classifyPath('/a/b/c/d/e')).toBe('pass'); // 어떤 라우트도 받지 않는 깊이 — Next 라우팅이 진짜 404
  });
});
