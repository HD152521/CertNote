'use client';

import { useLanguage, t } from '@/lib/i18n-client';
import { SubscriptionStatus } from '@/components/account/subscription/SubscriptionStatus';

interface BillingTabProps {
  isPro: boolean;
  periodEnd: string | null;
  daysLeft: number | null;
}

export function BillingTab({ isPro, periodEnd, daysLeft }: BillingTabProps) {
  const lang = useLanguage();

  return (
    <div className="space-y-8">
      {/* Subscription Information */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          {lang === 'en' ? 'Current Subscription' : '현재 구독'}
        </h2>
        <SubscriptionStatus
          isPro={isPro}
          periodEnd={periodEnd}
          daysLeft={daysLeft}
          showActions={true}
        />
      </section>

      {/* Payment History - TODO: Replace with userId when available */}
      {/* Temporarily commenting out until userId is available in props */}
      {/* <section className="space-y-2">
        <h2 className="text-sm font-medium">
          {lang === 'en' ? 'Payment History' : '결제 내역'}
        </h2>
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <SubscriptionHistory userId="" />
        </div>
      </section> */}

      {/* Billing FAQ - Placeholder */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          {lang === 'en' ? 'Billing FAQ' : '청구 FAQ'}
        </h2>
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium text-fg">
                {lang === 'en' ? 'How do I cancel my subscription?' : '구독을 취소하려면?'}
              </p>
              <p className="text-fg-muted mt-1">
                {lang === 'en'
                  ? 'Click the "Cancel Subscription" button above. You can reactivate anytime.'
                  : '위의 "구독 취소" 버튼을 클릭하세요. 언제든지 재가입할 수 있습니다.'}
              </p>
            </div>
            <div>
              <p className="font-medium text-fg">
                {lang === 'en' ? 'When will I be charged?' : '언제 청구되나요?'}
              </p>
              <p className="text-fg-muted mt-1">
                {lang === 'en'
                  ? 'You will be charged on your renewal date each month.'
                  : '매달 갱신일에 청구됩니다.'}
              </p>
            </div>
            <div>
              <p className="font-medium text-fg">
                {lang === 'en' ? 'Can I change my payment method?' : '결제 방법을 변경할 수 있나요?'}
              </p>
              <p className="text-fg-muted mt-1">
                {lang === 'en'
                  ? 'Yes, click "Change Payment Method" to update your card details.'
                  : '네, "결제 정보 변경" 버튼을 클릭하여 카드 정보를 업데이트하세요.'}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
