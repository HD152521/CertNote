import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { SubscriptionCard } from '@/components/subscription/SubscriptionCard';
import { SubscriptionHistory } from '@/components/subscription/SubscriptionHistory';

export const metadata = {
  title: 'Subscription Management',
};

export default async function SubscriptionPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const entitlementService = getEntitlementService();
  const entitlement = await entitlementService.getEntitlement(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">구독 관리</h1>
        <p className="mt-2 text-fg-secondary">현재 플랜을 관리하고 청구 정보를 확인하세요.</p>
      </div>

      {/* Current Subscription */}
      <SubscriptionCard entitlement={entitlement} userId={user.id} />

      {/* Billing History */}
      <SubscriptionHistory userId={user.id} />

      {/* FAQ */}
      <div className="space-y-4 rounded-lg border border-border-secondary bg-bg-secondary p-6">
        <h2 className="text-lg font-semibold">자주 묻는 질문</h2>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-medium">구독을 취소하면 어떻게 되나요?</dt>
            <dd className="mt-1 text-fg-secondary">
              취소 즉시 유료 기능 접근이 중단되며, 환불은 되지 않습니다.
            </dd>
          </div>
          <div>
            <dt className="font-medium">결제 정보를 변경할 수 있나요?</dt>
            <dd className="mt-1 text-fg-secondary">
              네, 아래 '결제 정보 변경' 버튼으로 카드를 업데이트할 수 있습니다.
            </dd>
          </div>
          <div>
            <dt className="font-medium">월간에서 연간으로 변경하면?</dt>
            <dd className="mt-1 text-fg-secondary">
              남은 달을 크레딧으로 환산해 차액만 청구됩니다.
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
