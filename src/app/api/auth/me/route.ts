import { getCurrentUser } from '@/lib/auth/currentUser';

// 현재 로그인 사용자 정보. 비로그인은 user: null (에러 아님).
export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ user: null });
  }
  return Response.json({ user: { id: session.sub, email: session.email, role: session.role } });
}
