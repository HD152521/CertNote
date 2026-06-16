import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

// /admin 이하는 admin 역할만. /dashboard·/review·/notebook·/exam 은 로그인 필요.
// plan(Pro) 판정은 Edge 미들웨어에서 DB 조회가 안 되므로 여기서 하지 않고,
// 서버 컴포넌트/라우트 핸들러에서 EntitlementService로 권위 판정한다.
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
  matcher: ['/admin/:path*', '/dashboard/:path*', '/review/:path*', '/notebook/:path*', '/exam/:path*'],
};
