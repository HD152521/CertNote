import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { LANG_COOKIE, resolveLanguage } from '@/lib/i18n';
import { classifyPath } from '@/lib/proxyRouting';
import { contentPathExists } from '@/lib/contentExists';
import { unpresentableEnDayRedirect } from '@/lib/day/enRedirect';

// 어떤 실제 라우트 패턴과도 매칭하지 않는 3세그먼트 마커. docs/SEO-indexing-fix-plan.md Step6 —
// {aws,linux,en}/[slug]/[week]/[day] 계열은 항상 4세그먼트, 허브 [category]/[slug]는 2세그먼트라
// 3세그먼트는 애초에 존재하지 않는 라우트 형태(실측: /aws-certs/saa-c03/bogus가 이미 진짜 404).
// 여기로 rewrite하면 Next가 "라우트 없음" 경로를 타 렌더를 시작하지 않고 프리렌더된 not-found를
// 그대로 내보낸다 — 스트리밍이 시작되지 않으므로 상태코드도 진짜 404로 나간다.
const NOT_FOUND_MARKER = '/__not-found__/__nf__/__nf__';

// /aws-certs·/en 하위 콘텐츠 존재 검증(day 소프트 404 수정). 이 두 접두사 아래엔 콘텐츠 라우트만
// 있고 다른 정적 페이지가 전혀 없어(전수 확인) 아래 처리가 /checkout류와 충돌할 위험이 없다.
async function handleContentRoute(req: NextRequest): Promise<NextResponse> {
  const exists = await contentPathExists(req.nextUrl.pathname);
  if (!exists) {
    return NextResponse.rewrite(new URL(NOT_FOUND_MARKER, req.url));
  }
  // 한글이 남은 영어 day 는 렌더 전에 한국어 같은 day 로 307(임시 — 번역이 끝나면 영어판이 다시 열린다).
  // 라우트 안의 redirect() 는 스트리밍 때문에 200 이 되어 캐시되므로 여기서 한다(src/lib/day/enRedirect.ts).
  const koUrl = await unpresentableEnDayRedirect(req.nextUrl.pathname);
  if (koUrl) {
    const res = NextResponse.redirect(new URL(koUrl, req.url), 307);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  return NextResponse.next();
}

// /admin 이하는 admin 역할만. /dashboard·/review·/notebook·/exam·/account 는 로그인 필요.
// plan(Pro) 판정은 Edge 프록시에서 DB 조회가 안 되므로 여기서 하지 않고,
// 서버 컴포넌트/라우트 핸들러에서 EntitlementService로 권위 판정한다.
//
// 세션 무효화(token_version) 한계: Edge 런타임은 DB 조회 불가 → 여기서는 JWT 서명/만료만 검증한다.
// 따라서 비밀번호 변경/재설정으로 무효화된 토큰도 이 프록시는 통과시킬 수 있다. 실제 무효화 판정은
// 보호 페이지/라우트의 getCurrentUser()(Node, DB의 token_version 대조)가 권위를 가진다.
// 프록시는 비로그인 차단용 1차 게이트일 뿐이다.
export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // 경로 분류는 순수 함수(src/lib/proxyRouting.ts)에 있다 — 판정 근거와 단위 테스트는 거기.
  const decision = classifyPath(path);
  if (decision === 'content') return handleContentRoute(req);
  if (decision === 'not-found') return NextResponse.rewrite(new URL(NOT_FOUND_MARKER, req.url));
  if (decision === 'pass') return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const needsAdmin = path.startsWith('/admin');
  const authorized = needsAdmin ? session?.role === 'admin' : Boolean(session);

  if (!authorized) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', path);
    return NextResponse.redirect(loginUrl);
  }

  // 이 프록시가 매칭하는 경로는 전부 로그인 전용(noindex)이라 URL에 /en 접두가 없다.
  // 따라서 언어는 lang 쿠키가 결정한다. 색인 대상 공개 페이지는 resolveLanguage가
  // URL로만 판정하므로 쿠키가 크롤러 응답을 흔들지 않는다.
  const lang = resolveLanguage(path, req.cookies.get(LANG_COOKIE)?.value);

  // 서버 컴포넌트의 headers()에 닿게 하려면 반드시 요청 헤더를 갈아끼워야 한다.
  // response.headers.set()은 브라우저로만 나가고 렌더링에는 보이지 않는다.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-language', lang);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    '/admin/:path*', '/dashboard/:path*', '/review/:path*', '/notebook/:path*', '/exam/:path*', '/account/:path*',
    // 콘텐츠 존재 검증(docs/SEO-indexing-fix-plan.md Step6). 섹션 허브(/aws·/linux)·/en 자체는
    // handleContentRoute 내부에서 항상 통과시키므로 여기 포함해도 안전하다. /aws-certs 는 레거시
    // 전파 창 대비(정상 흐름에선 next.config 301이 먼저 처리).
    '/aws/:path*', '/linux/:path*', '/aws-certs/:path*', '/en/:path*',
    // 임의 4세그먼트 경로(/:a/:b/:c/:d) — day 라우트 두 개가 받을 수 있는 유일한 깊이. 어떤 철자든 존재 검증을 거치게
    // 한다(근거: src/lib/proxyRouting.ts). _next/static·_next/image 에셋은 제외한다.
    '/:a((?!_next/static/|_next/image)[^/]+)/:b/:c/:d',
    // 대소문자 변형 접두사(/AWS·/Linux·/EN 허브와 하위). 정규식에 (?i)를 쓸 수 없어 문자 클래스로 쓴다.
    '/:category([aA][wW][sS])/:path*', '/:category([lL][iI][nN][uU][xX])/:path*', '/:category([eE][nN])/:path*',
  ],
};
