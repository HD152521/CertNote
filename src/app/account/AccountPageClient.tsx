'use client';

import Link from 'next/link';
import { useLanguage, t } from '@/lib/i18n-client';
import { AccountForms } from './AccountForms';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { ProfileSection, type ProfileValues } from '@/components/account/ProfileSection';

export interface CertOption {
  slug: string;
  code: string;
  name: string;
}

interface AccountPageClientProps {
  userEmail: string;
  certs: CertOption[];
  initial: ProfileValues;
  isPro: boolean;
  periodEnd: string | null;
  daysLeft: number | null;
}

export function AccountPageClient({
  userEmail,
  certs,
  initial,
  isPro,
  periodEnd,
  daysLeft,
}: AccountPageClientProps) {
  const lang = useLanguage();

  return (
    <div className="mx-auto max-w-sm space-y-8 py-16">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t(lang, 'myPage')}</h1>
        <p className="text-sm text-fg-muted">{userEmail}</p>
      </div>

      {/* 구독 상태 */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t(lang, 'subscriptionPlan')}</h2>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${isPro ? 'bg-accent/10 text-accent' : 'bg-bg-subtle text-fg-faint'}`}>
              {isPro ? t(lang, 'pro') : t(lang, 'free')}
            </span>
            {isPro && (
              <span className="text-xs text-fg-muted">
                {periodEnd === null ? t(lang, 'noExpiration') : `~${periodEnd} · ${daysLeft} ${t(lang, 'daysRemaining')}`}
              </span>
            )}
          </div>
          {!isPro && (
            <Link href="/pricing" className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg">{t(lang, 'upgradeButton')}</Link>
          )}
        </div>
        <Link href="/dashboard" className="inline-block text-xs text-fg-muted underline underline-offset-4 hover:text-fg">
          {t(lang, 'viewStats')}
        </Link>
      </section>

      <ProfileSection certs={certs} initial={initial} />
      <NotificationSettings />
      <AccountForms />
    </div>
  );
}
