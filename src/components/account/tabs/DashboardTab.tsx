'use client';

import { useLanguage, t } from '@/lib/i18n-client';
import { SubscriptionStatus } from '@/components/account/subscription/SubscriptionStatus';

interface DashboardTabProps {
  isPro: boolean;
  periodEnd: string | null;
  daysLeft: number | null;
}

export function DashboardTab({ isPro, periodEnd, daysLeft }: DashboardTabProps) {
  const lang = useLanguage();

  return (
    <div className="space-y-6">
      {/* Subscription Status - Prominent Card */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t(lang, 'subscriptionPlan')}</h2>
        <SubscriptionStatus
          isPro={isPro}
          periodEnd={periodEnd}
          daysLeft={daysLeft}
          showActions={true}
        />
      </section>

      {/* Learning Statistics - Placeholder */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          {lang === 'en' ? 'Learning Statistics' : '학습 통계'}
        </h2>
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <p className="text-sm text-fg-muted">
            {lang === 'en'
              ? 'Learning statistics coming soon. Check back later!'
              : '학습 통계는 곧 추가될 예정입니다. 나중에 다시 확인해 주세요!'}
          </p>
        </div>
      </section>

      {/* Recent Activity - Placeholder */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          {lang === 'en' ? 'Recent Activity' : '최근 활동'}
        </h2>
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <p className="text-sm text-fg-muted">
            {lang === 'en'
              ? 'Your recent activity will appear here.'
              : '최근 활동이 여기에 표시됩니다.'}
          </p>
        </div>
      </section>
    </div>
  );
}
