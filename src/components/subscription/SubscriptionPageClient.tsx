'use client';

import { useLanguage, t } from '@/lib/i18n-client';
import { Entitlement } from '@/lib/entitlement/types';
import { SubscriptionCard } from '@/components/subscription/SubscriptionCard';
import { SubscriptionHistory } from '@/components/subscription/SubscriptionHistory';

interface SubscriptionPageClientProps {
  entitlement: Entitlement;
  userId: string;
}

export function SubscriptionPageClient({ entitlement, userId }: SubscriptionPageClientProps) {
  const lang = useLanguage();

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">
          {lang === 'en' ? 'Subscription Management' : '구독 관리'}
        </h1>
        <p className="mt-2 text-fg-secondary">
          {lang === 'en'
            ? 'Manage your current plan and review billing information.'
            : '현재 플랜을 관리하고 청구 정보를 확인하세요.'}
        </p>
      </div>

      {/* Current Subscription */}
      <SubscriptionCard entitlement={entitlement} userId={userId} />

      {/* Billing History */}
      <SubscriptionHistory userId={userId} />

      {/* FAQ */}
      <div className="space-y-4 rounded-lg border border-border-secondary bg-bg-elevated p-6">
        <h2 className="text-lg font-semibold">{t(lang, 'faq')}</h2>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-medium">{t(lang, 'cancelSubscriptionQuestion')}</dt>
            <dd className="mt-1 text-fg-secondary">
              {t(lang, 'cancelSubscriptionAnswer')}
            </dd>
          </div>
          <div>
            <dt className="font-medium">{t(lang, 'changePaymentQuestion')}</dt>
            <dd className="mt-1 text-fg-secondary">
              {t(lang, 'changePaymentAnswer')}
            </dd>
          </div>
          <div>
            <dt className="font-medium">{t(lang, 'monthlyToAnnualQuestion')}</dt>
            <dd className="mt-1 text-fg-secondary">
              {t(lang, 'monthlyToAnnualAnswer')}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
