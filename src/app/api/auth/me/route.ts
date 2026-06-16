import { getCurrentUser } from '@/lib/auth/currentUser';
import { getEntitlementService } from '@/lib/entitlement/factory';

// 현재 로그인 사용자 정보. 비로그인은 user: null (에러 아님).
// plan은 매 호출 DB에서 최신값을 읽는다 → 수동 Pro 부여가 재로그인 없이 UI에 반영된다.
export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ user: null });
  }
  const ent = await getEntitlementService().getEntitlement(session.sub);
  return Response.json({
    user: { id: session.sub, email: session.email, role: session.role, plan: ent.plan },
  });
}
