import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';
import { LANG_COOKIE, resolveLanguage } from '@/lib/i18n';

// /admin 이하는 admin 역할만. /dashboard·/review·/notebook·/exam·/account 는 로그인 필요.
// plan(Pro) 판정은 Edge 프록시에서 DB 조회가 안 되므로 여기서 하지 않고,
// 서버 컴포넌트/라우트 핸들러에서 EntitlementService로 권위 판정한다.
//
// 세션 무효화(token_version) 한계: Edge 런타임은 DB 조회 불가 → 여기서는 JWT 서명/만료만 검증한다.
// 따라서 비밀번호 변경/재설정으로 무효화된 토큰도 이 프록시는 통과시킬 수 있다. 실제 무효화 판정은
// 보호 페이지/라우트의 getCurrentUser()(Node, DB의 token_version 대조)가 권위를 가진다.
// 프록시는 비로그인 차단용 1차 게이트일 뿐이다.
export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const path = req.nextUrl.pathname;

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
  matcher: ['/admin/:path*', '/dashboard/:path*', '/review/:path*', '/notebook/:path*', '/exam/:path*', '/account/:path*'],
};
