import { getCurrentUser } from '@/lib/auth/currentUser';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { getVerificationStatus } from '@/lib/auth/emailVerification';
import { touchLastSeen } from '@/lib/push/pushRepository';

// 현재 로그인 사용자 정보. 비로그인은 user: null (에러 아님).
// plan은 매 호출 DB에서 최신값을 읽는다 → 수동 Pro 부여가 재로그인 없이 UI에 반영된다.
// emailVerified도 함께 내려 UI가 미인증 배너를 띄울 수 있게 한다(기존 사용자는 DEFAULT true).
export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ user: null });
  }
  // 방문 기록 갱신(1시간 스로틀). 미방문 복귀 알림 판정의 기준. 실패해도 /me는 정상 응답.
  await touchLastSeen(session.sub).catch(() => {});
  const ent = await getEntitlementService().getEntitlement(session.sub);
  const status = await getVerificationStatus(session.sub);
  return Response.json({
    user: {
      id: session.sub,
      email: session.email,
      role: session.role,
      plan: ent.plan,
      emailVerified: status?.emailVerified ?? true,
    },
  });
}
