import { DEFAULT_CATEGORY, EN_CATEGORY, SECTIONS } from './category';

// src/proxy.ts 의 경로 분류(순수 함수 — 빌드 없이 단위 테스트한다).
//
// 배경: root loading.tsx 가 모든 페이지를 Suspense 로 감싸 응답이 스트리밍으로 시작되므로, 페이지 안의
// notFound()는 이미 200 헤더가 나간 뒤에 불린다(Next.js 문서 loading.md "Status Codes"). day 라우트는
// 첫 요청 때 생성돼 캐시되므로 그 200 응답이 그대로 캐시된다. 따라서 "존재하지 않는 경로가 day 라우트에
// 도달하지 못하게" 렌더 전에 막아야 하고, 그 판정을 철자(week*/day*)가 아니라 구조(세그먼트 수)로 한다:
// 4세그먼트 경로를 받는 캐시 라우트는 {aws,linux,en}/[slug]/[week]/[day] 와 …/week1/[day] 뿐이다(리터럴
// category 폴더 — src/lib/day/dayRoute.tsx). 라우터가 임의 category 를 매칭하지 않는 것이 1차 방어이고,
// 이 분류는 그 위의 이중 방어다. 존재하지 않는 day·slug 를 렌더 전에 거르는 것은 contentPathExists 의 몫이다.
export type PathDecision =
  | 'home' // 홈(/) — 세션 쿠키로 학습 홈 rewrite 여부를 정한다.
  | 'study-home' // 내부 전용 학습 홈 경로(/home) — 직접 연 요청은 홈으로 돌려보낸다.
  | 'content' // 콘텐츠 접두사 — contentPathExists 가 존재 여부의 단일 판정자.
  | 'not-found' // 어떤 실제 라우트에도 해당하지 않음 → 렌더 전에 진짜 404.
  | 'auth' // 로그인 필요 라우트(기존 게이트).
  | 'pass'; // 건드리지 않음.

export const STUDY_HOME_PATH = '/home';

const CONTENT_PREFIXES: readonly string[] = [...SECTIONS, EN_CATEGORY, DEFAULT_CATEGORY];
const PROTECTED_PREFIXES: readonly string[] = ['admin', 'dashboard', 'review', 'notebook', 'exam', 'account'];
// 4세그먼트 이상 깊이의 실제 API 라우트(src/app/api 를 훑어 같은 목록임을 확인하는 테스트가 있다).
// 이 밖의 /api/a/b/c 는 존재하지 않는다.
export const REAL_FOUR_SEGMENT_API_ROUTES: readonly string[] = ['/api/auth/google/callback', '/api/account/password/setup'];
// Next 가 직접 서빙하는 내부 에셋 접두사. 이 밖의 /_next/* 는 존재하지 않는다.
const NEXT_ASSET_PREFIXES: readonly string[] = ['/_next/static/', '/_next/image'];
// day 라우트가 받는 URL 깊이.
const DAY_ROUTE_DEPTH = 4;

export function classifyPath(pathname: string): PathDecision {
  if (pathname === '/') return 'home';
  if (pathname === STUDY_HOME_PATH) return 'study-home';

  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0] ?? '';

  if (CONTENT_PREFIXES.includes(first)) return 'content';
  // 대소문자만 다른 접두사(/AWS, /Linux). 대소문자 무시 호스트에선 프리렌더 파일 조회가 소문자 페이지로
  // 풀려 200 이 되므로 호스트와 무관하게 404 로 고정한다.
  if (CONTENT_PREFIXES.includes(first.toLowerCase())) return 'not-found';
  if (PROTECTED_PREFIXES.includes(first)) return 'auth';
  if (NEXT_ASSET_PREFIXES.some((p) => pathname.startsWith(p))) return 'pass';
  if (first === 'api' || first === '_next') {
    // 알려진 실제 라우트가 아니면 존재하지 않는다 — 철자·깊이 열거가 아니라 "실제 목록"에 대한 허용 목록.
    return segments.length < DAY_ROUTE_DEPTH || REAL_FOUR_SEGMENT_API_ROUTES.includes(pathname) ? 'pass' : 'not-found';
  }
  // 그 외 모든 4세그먼트 경로(/foo/bar/baz/qux, /foo/bar/Week2/day1, /foo/bar/week1/x …)는 day 라우트에만
  // 걸릴 수 있는 깊이인데 category 가 콘텐츠 접두사가 아니므로 존재할 수 없다.
  if (segments.length === DAY_ROUTE_DEPTH) return 'not-found';
  return 'pass';
}
