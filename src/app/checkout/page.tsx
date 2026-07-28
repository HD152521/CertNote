import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';
import { CheckoutPageClient } from '@/components/checkout/CheckoutPageClient';

// robots.txt로 차단되지 않은 공개 라우트라 자기참조 canonical이 필요하다(docs/SEO-indexing-fix-plan.md Step 2).
// 지정하지 않으면 루트 레이아웃 canonical 상속이 끊긴 뒤에는 canonical이 아예 없는 상태가 되어
// Google이 임의의 URL을 대표로 고를 위험이 남는다.
export const metadata: Metadata = {
  title: 'Pro 구독하기 | Checkout',
  alternates: { canonical: '/checkout' },
};

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/checkout');

  return <CheckoutPageClient userId={user.sub} email={user.email} />;
}
