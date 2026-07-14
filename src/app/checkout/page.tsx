import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';
import { CheckoutPageClient } from '@/components/checkout/CheckoutPageClient';

export const metadata = {
  title: 'Pro 구독하기 | Checkout',
};

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/checkout');

  return <CheckoutPageClient userId={user.sub} email={user.email} />;
}
