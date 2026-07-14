import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';

export const metadata = {
  title: 'Pro 구독하기',
};

export default async function CheckoutPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?redirect=/checkout');

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Pro 플랜 업그레이드</h1>
        <p className="mt-2 text-fg-secondary">모든 자격증, 모의고사, 무제한 복습에 접근하세요.</p>
      </div>

      {/* Plan Comparison */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Free Plan */}
        <div className="rounded-lg border border-border-secondary bg-bg-secondary p-6">
          <h3 className="text-lg font-semibold">Free</h3>
          <p className="mt-1 text-2xl font-bold">₩0<span className="text-sm">/월</span></p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>✓ 각 자격증 Week1 전체</li>
            <li>✓ 기본 연습 문제</li>
            <li className="text-fg-secondary">✗ 모의고사</li>
            <li className="text-fg-secondary">✗ Week2+ 콘텐츠</li>
          </ul>
        </div>

        {/* Pro Plan */}
        <div className="rounded-lg border-2 border-accent bg-bg-secondary p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Pro</h3>
            <span className="rounded bg-accent px-2 py-1 text-xs font-semibold text-bg">추천</span>
          </div>
          <p className="mt-1 text-2xl font-bold">₩9,900<span className="text-sm">/월</span></p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>✓ 모든 자격증 전체 콘텐츠</li>
            <li>✓ 모의고사 (자격증별 65~72문항)</li>
            <li>✓ 무제한 SRS 복습</li>
            <li>✓ 오답 노트 & 성적 분석</li>
          </ul>
        </div>
      </div>

      {/* Checkout Form */}
      <CheckoutForm userId={user.sub} email={user.email} />

      {/* Trust Badges */}
      <div className="flex flex-wrap gap-6 border-t border-border-secondary pt-6 text-center">
        <div className="flex-1">
          <div className="text-sm font-semibold text-fg">🔒 안전한 결제</div>
          <div className="mt-1 text-xs text-fg-secondary">모든 결제는 암호화됩니다</div>
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-fg">💰 환불 정책</div>
          <div className="mt-1 text-xs text-fg-secondary">7일 이내 환불 가능</div>
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-fg">📞 고객 지원</div>
          <div className="mt-1 text-xs text-fg-secondary">24시간 이메일 지원</div>
        </div>
      </div>
    </div>
  );
}
