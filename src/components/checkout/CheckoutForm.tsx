'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CheckoutFormProps {
  userId: string;
  email: string;
}

export function CheckoutForm({ userId, email }: CheckoutFormProps) {
  const router = useRouter();
  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prices = {
    monthly: { amount: 9900, label: '₩9,900/월' },
    annual: { amount: 99000, label: '₩99,000/년 (17% 할인)' },
  };

  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // TODO: 결제 게이트웨이 호출 (Tosspay/Portone)
      // const response = await fetch('/api/payment/checkout', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ userId, plan, amount: prices[plan].amount }),
      // });

      // 임시: 결제 페이지로 리다이렉트
      console.log('Checkout initiated', { userId, plan, amount: prices[plan].amount });

      // 실제 구현 후 결제 게이트웨이 리다이렉트
      // router.push(response.paymentUrl);

      // 테스트용: 성공 페이지
      router.push('/account/subscription?success=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : '결제 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleCheckout} className="space-y-6 rounded-lg border border-border-secondary bg-bg-secondary p-6">
      {/* Plan Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold">청구 주기</label>
        <div className="grid gap-3 md:grid-cols-2">
          {(['monthly', 'annual'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setPlan(option)}
              className={`rounded-lg border-2 p-4 text-left transition ${
                plan === option
                  ? 'border-accent bg-accent/10'
                  : 'border-border-secondary hover:border-border-primary'
              }`}
            >
              <div className="font-semibold">
                {option === 'monthly' ? '월간' : '연간'}
              </div>
              <div className="text-sm text-fg-secondary">
                {prices[option].label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Card Input (Placeholder) */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold">카드 정보</label>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="카드 번호 (16자리)"
            className="w-full rounded-lg border border-border-secondary bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
            disabled={isLoading}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="MM/YY"
              className="rounded-lg border border-border-secondary bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              disabled={isLoading}
            />
            <input
              type="text"
              placeholder="CVC"
              className="rounded-lg border border-border-secondary bg-bg px-3 py-2 text-sm focus:border-accent focus:outline-none"
              disabled={isLoading}
            />
          </div>
        </div>
        <p className="text-xs text-fg-secondary">
          💡 현재는 결제 게이트웨이 연동 중입니다. 테스트 카드: 4111 1111 1111 1111
        </p>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold">이메일</label>
        <input
          type="email"
          value={email}
          disabled
          className="w-full rounded-lg border border-border-secondary bg-bg-tertiary px-3 py-2 text-sm text-fg-secondary"
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Summary */}
      <div className="space-y-2 border-t border-border-secondary pt-4">
        <div className="flex justify-between text-sm">
          <span className="text-fg-secondary">소계</span>
          <span>{prices[plan].label}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-fg-secondary">세금 (VAT)</span>
          <span>포함</span>
        </div>
        <div className="flex justify-between border-t border-border-secondary pt-2 font-semibold">
          <span>총액</span>
          <span>{prices[plan].label}</span>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-bg transition hover:bg-accent/90 disabled:opacity-50"
      >
        {isLoading ? '처리 중...' : `${prices[plan].label.split('/')[0]} 결제하기`}
      </button>

      {/* Terms */}
      <p className="text-xs text-fg-secondary">
        계속하면 CertNote의{' '}
        <a href="/terms" className="underline hover:text-fg">
          약관
        </a>
        과{' '}
        <a href="/privacy" className="underline hover:text-fg">
          개인정보처리방침
        </a>
        에 동의하는 것입니다.
      </p>
    </form>
  );
}
