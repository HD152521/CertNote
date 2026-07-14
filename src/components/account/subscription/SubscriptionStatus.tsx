'use client';

import Link from 'next/link';
import { useLanguage, t } from '@/lib/i18n-client';

interface SubscriptionStatusProps {
  isPro: boolean;
  periodEnd: string | null;
  daysLeft: number | null;
  showActions?: boolean;
}

export function SubscriptionStatus({
  isPro,
  periodEnd,
  daysLeft,
  showActions = false,
}: SubscriptionStatusProps) {
  const lang = useLanguage();
  const checkoutHref = lang === 'en' ? '/en/checkout' : '/checkout';

  return (
    <div
      className={`rounded-lg border p-6 ${
        isPro
          ? 'border-accent bg-accent/10'
          : 'border-border bg-bg-secondary'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {lang === 'en' ? 'Current Plan' : '현재 플랜'}
          </p>
          <p
            className={`mt-2 text-2xl font-semibold ${
              isPro ? 'text-accent' : 'text-fg'
            }`}
          >
            {isPro ? 'Pro' : 'Free'}
          </p>
          {isPro && periodEnd && (
            <div className="mt-2 text-sm text-fg-muted">
              <p>
                <span className="font-medium">
                  {lang === 'en' ? 'Renewal Date: ' : '갱신일: '}
                </span>
                <strong>{periodEnd}</strong>
              </p>
              <p className="text-accent font-semibold">
                {daysLeft} {t(lang, 'daysRemaining')}
              </p>
            </div>
          )}
          {!isPro && (
            <div className="mt-2 text-sm text-fg-muted">
              <p>{t(lang, 'week1Only')}</p>
            </div>
          )}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isPro
              ? 'bg-accent text-white'
              : 'bg-border-strong text-fg-secondary'
          }`}
        >
          {isPro ? t(lang, 'active') : t(lang, 'free')}
        </span>
      </div>

      {/* Action Buttons */}
      {showActions && (
        <div className="mt-6 flex flex-wrap gap-2">
          {!isPro && (
            <Link
              href={checkoutHref}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 transition"
            >
              {t(lang, 'upgrade')}
            </Link>
          )}
          {isPro && (
            <>
              <button
                type="button"
                className="rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold hover:bg-bg-tertiary transition"
              >
                {t(lang, 'changePayment')}
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/10 transition"
              >
                {t(lang, 'cancelSubscription')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
