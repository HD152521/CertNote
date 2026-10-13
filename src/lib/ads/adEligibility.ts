// 광고(로더·슬롯)를 싣지 않는 경로(docs/P3-adsense-readiness-plan.md Step 9).
//
// 판정은 URL 첫 세그먼트로만 한다. 쿠키·세션을 보지 않으므로 서버 프리렌더와 클라이언트가 같은
// 답을 내고, 홈·허브·day 페이지의 정적 캐시에 영향이 없다.
const AD_EXCLUDED_ROOT_SEGMENTS: ReadonlySet<string> = new Set([
  // 로그인 전용 화면 — 개인화된 화면이라 애드센스 크롤러가 내용을 볼 수 없다.
  'dashboard', 'exam', 'review', 'notebook', 'account', 'admin', 'onboarding', 'welcome',
  // 로그인 사용자의 학습 홈. 공개 URL 이 아니라 proxy 가 `/` 를 rewrite 하는 목적지다(src/proxy.ts).
  'home',
  // 인증 화면 — 본문이 없는 폼 화면에 광고를 두는 것은 애드센스 정책 위반 소지가 있다.
  'login', 'signup', 'forgot', 'reset', 'verify',
  // 구독·결제 화면.
  'pricing', 'checkout',
]);

/**
 * 이 경로에 광고를 실어도 되는가. 경로를 알 수 없으면(null·빈 값·`/` 로 시작하지 않음) false —
 * 모르는 화면에는 싣지 않는 쪽이 안전하다.
 */
export function isAdEligiblePath(pathname: string | null | undefined): boolean {
  if (!pathname || !pathname.startsWith('/')) return false;
  const rootSegment = pathname.split(/[?#]/, 1)[0].split('/')[1] ?? '';
  return !AD_EXCLUDED_ROOT_SEGMENTS.has(rootSegment);
}

/**
 * 루트 레이아웃에서 읽은 useSelectedLayoutSegments() 값을 라우트 경로로 바꾼다.
 *
 * 주소창 경로(usePathname) 대신 세그먼트를 쓰는 이유: 로그인 사용자의 홈은 주소가 `/` 인 채로
 * /home 라우트가 렌더된다. 주소로 판정하면 학습 홈이 공개 홈으로 보여 광고가 실린다.
 * 라우트 그룹 `(…)` 은 URL 에 나타나지 않으므로 뺀다.
 */
export function routePathFromSegments(segments: readonly string[]): string {
  return `/${segments.filter((segment) => !segment.startsWith('(')).join('/')}`;
}
