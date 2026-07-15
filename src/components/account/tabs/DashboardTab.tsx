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
    <div className="space-y-8">
      {/* 📦 Subscription Status - Prominent Section */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          {lang === 'en' ? '📦 Your Plan' : '📦 현재 플랜'}
        </h2>
        <SubscriptionStatus
          isPro={isPro}
          periodEnd={periodEnd}
          daysLeft={daysLeft}
          showActions={true}
        />
      </section>

      {/* 📊 Learning Statistics - Grid Layout */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          {lang === 'en' ? '📊 This Month' : '📊 이번 달'}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {/* Cards Study Count */}
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <p className="text-xs text-fg-muted mb-1">
              {lang === 'en' ? 'Cards Studied' : '학습한 카드'}
            </p>
            <p className="text-2xl font-semibold text-fg">—</p>
            <p className="text-xs text-fg-faint mt-1">Coming soon</p>
          </div>

          {/* Correct Rate */}
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <p className="text-xs text-fg-muted mb-1">
              {lang === 'en' ? 'Correct Rate' : '정답률'}
            </p>
            <p className="text-2xl font-semibold text-fg">—</p>
            <p className="text-xs text-fg-faint mt-1">Coming soon</p>
          </div>

          {/* Streak */}
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <p className="text-xs text-fg-muted mb-1">
              {lang === 'en' ? 'Day Streak' : '연속 학습'}
            </p>
            <p className="text-2xl font-semibold text-fg">—</p>
            <p className="text-xs text-fg-faint mt-1">Coming soon</p>
          </div>
        </div>
      </section>

      {/* 🎯 Recent Activity - Timeline */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          {lang === 'en' ? '🎯 Recent Activity' : '🎯 최근 활동'}
        </h2>
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <div className="space-y-3 text-center py-4">
            <p className="text-sm text-fg-muted">
              {lang === 'en'
                ? 'Your learning activity will appear here'
                : '학습 활동이 여기에 표시됩니다'}
            </p>
            <p className="text-xs text-fg-faint">
              {lang === 'en'
                ? 'Start studying to see your progress'
                : '학습을 시작하면 진행도가 표시됩니다'}
            </p>
          </div>
        </div>
      </section>

      {/* 💡 Tips - Info Card */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          {lang === 'en' ? '💡 Study Tip' : '💡 학습 팁'}
        </h2>
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm text-fg">
            {lang === 'en'
              ? 'Consistent study is the key to mastering AWS certifications. Practice daily and review difficult topics regularly.'
              : 'AWS 자격증 취득의 핵심은 꾸준한 학습입니다. 매일 연습하고 어려운 주제를 정기적으로 복습하세요.'}
          </p>
        </div>
      </section>
    </div>
  );
}
