import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { SubscriptionPageClient } from '@/components/subscription/SubscriptionPageClient';

export const metadata = {
  title: 'Subscription Management | 구독 관리',
};

export default async function SubscriptionPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const entitlementService = getEntitlementService();
  const entitlement = await entitlementService.getEntitlement(user.sub);

  return <SubscriptionPageClient entitlement={entitlement} userId={user.sub} />;
}
