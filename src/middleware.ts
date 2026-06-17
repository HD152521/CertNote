import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

// /admin 이하는 admin 역할만. /dashboard·/review·/notebook·/exam·/account 는 로그인 필요.
// plan(Pro) 판정은 Edge 미들웨어에서 DB 조회가 안 되므로 여기서 하지 않고,
// 서버 컴포넌트/라우트 핸들러에서 EntitlementService로 권위 판정한다.
//
// 세션 무효화(token_version) 한계: Edge 런타임은 DB 조회 불가 → 여기서는 JWT 서명/만료만 검증한다.
// 따라서 비밀번호 변경/재설정으로 무효화된 토큰도 이 미들웨어는 통과시킬 수 있다. 실제 무효화 판정은
// 보호 페이지/라우트의 getCurrentUser()(Node, DB의 token_version 대조)가 권위를 가진다.
// 미들웨어는 비로그인 차단용 1차 게이트일 뿐이다.
export async function middleware(req: NextRequest) {
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
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*', '/review/:path*', '/notebook/:path*', '/exam/:path*', '/account/:path*'],
};
