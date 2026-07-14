'use client';

import { useLanguage, t } from '@/lib/i18n-client';
import { Entitlement } from '@/lib/entitlement/types';

interface SubscriptionCardProps {
  entitlement: Entitlement;
  userId: string;
}

export function SubscriptionCard({ entitlement, userId }: SubscriptionCardProps) {
  const lang = useLanguage();
  const isPro = entitlement.isPro;
  const periodEnd = entitlement.periodEnd ? new Date(entitlement.periodEnd) : null;
  const daysRemaining = periodEnd
    ? Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const dateFormat = lang === 'en' ? 'en-US' : 'ko-KR';

  return (
    <div className="rounded-lg border border-border-secondary bg-bg-secondary p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {lang === 'en' ? 'Current Plan: ' : '현재 플랜: '}<span className={isPro ? 'text-accent' : 'text-fg-secondary'}>
              {isPro ? 'Pro' : 'Free'}
            </span>
          </h2>
          <p className="mt-2 text-sm text-fg-secondary">
            {isPro ? (
              <>
                {t(lang, 'allCertificationsAccess')}
                {periodEnd && (
                  <div className="mt-2">
                    {daysRemaining && daysRemaining > 0 ? (
                      <>
                        <span className="font-medium">{t(lang, 'renewalDate')}:</span> {periodEnd.toLocaleDateString(dateFormat)} ({daysRemaining} {t(lang, 'daysRemaining')})
                      </>
                    ) : (
                      <span className="text-red-600">{t(lang, 'subscriptionExpired')}</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>{t(lang, 'week1Only')}</>
            )}
          </p>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
          isPro ? 'bg-accent/20 text-accent' : 'bg-fg-tertiary text-fg-secondary'
        }`}>
          {isPro ? t(lang, 'active') : t(lang, 'free')}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex flex-wrap gap-3">
        {!isPro && (
          <a
            href={lang === 'en' ? '/en/checkout' : '/checkout'}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90"
          >
            {t(lang, 'upgrade')}
          </a>
        )}
        {isPro && (
          <button className="rounded-lg border border-border-secondary px-4 py-2 text-sm font-semibold hover:bg-bg-tertiary">
            {t(lang, 'changePayment')}
          </button>
        )}
        {isPro && (
          <button className="rounded-lg border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/10">
            {t(lang, 'cancelSubscription')}
          </button>
        )}
      </div>
    </div>
  );
}
