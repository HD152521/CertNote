'use client';

import Link from 'next/link';
import { useLanguage, t } from '@/lib/i18n-client';
import { ChangePaymentModal, CancelSubscriptionModal } from './SubscriptionModals';

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
      className={`rounded-xl border-2 p-8 transition-all ${
        isPro
          ? 'border-accent bg-gradient-to-br from-accent/10 to-accent/5'
          : 'border-border bg-gradient-to-br from-bg-secondary to-bg'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Plan Info */}
        <div className="flex-1 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-fg-muted">
            {lang === 'en' ? 'Your Plan' : '현재 플랜'}
          </p>
          <div>
            <p
              className={`text-4xl font-bold tracking-tight ${
                isPro ? 'text-accent' : 'text-fg'
              }`}
            >
              {isPro ? 'Pro' : 'Free'}
            </p>
          </div>

          {/* Pro: Renewal Info */}
          {isPro && periodEnd && (
            <div className="space-y-2 pt-2">
              <div className="text-sm">
                <p className="text-fg-muted text-xs mb-1">
                  {lang === 'en' ? 'Renews on' : '갱신일'}
                </p>
                <p className="font-medium text-fg">{periodEnd}</p>
              </div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/20">
                <span className="text-lg">✓</span>
                <span className="font-semibold text-accent">
                  {daysLeft} {t(lang, 'daysRemaining')}
                </span>
              </div>
            </div>
          )}

          {/* Free: Limited Info */}
          {!isPro && (
            <p className="text-sm text-fg-muted pt-2">
              {t(lang, 'week1Only')}
            </p>
          )}
        </div>

        {/* Right: Status Badge */}
        <div className="flex flex-col items-end gap-3">
          <span
            className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide ${
              isPro
                ? 'bg-accent/20 text-accent'
                : 'bg-border-strong text-fg-secondary'
            }`}
          >
            {isPro ? '⭐ ' + t(lang, 'active') : t(lang, 'free')}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      {showActions && (
        <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row gap-2">
          {!isPro && (
            <Link
              href={checkoutHref}
              className="flex-1 rounded-lg bg-accent px-6 py-3 text-center text-sm font-bold text-white hover:bg-accent/90 transition-colors"
            >
              {t(lang, 'upgrade')} → Pro
            </Link>
          )}
          {isPro && (
            <>
              <ChangePaymentModal />
              <CancelSubscriptionModal />
            </>
          )}
        </div>
      )}
    </div>
  );
}
