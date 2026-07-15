'use client';

import { useLanguage, t } from '@/lib/i18n-client';
import { useEffect, useState } from 'react';
import { SubscriptionStatus } from '@/components/account/subscription/SubscriptionStatus';

interface DashboardTabProps {
  isPro: boolean;
  periodEnd: string | null;
  daysLeft: number | null;
}

interface ReviewStats {
  totalCards: number;
  dueCards: number;
  masteredCards: number;
}

export function DashboardTab({ isPro, periodEnd, daysLeft }: DashboardTabProps) {
  const lang = useLanguage();
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/review/stats');
        if (!res.ok) throw new Error('Failed to fetch stats');
        const data = await res.json();
        setStats(data);
      } catch (error) {
        console.error('Stats fetch error:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

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
          {lang === 'en' ? '📊 Your Progress' : '📊 학습 진행도'}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {/* Total Cards */}
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <p className="text-xs text-fg-muted mb-2">
              {lang === 'en' ? 'Total Cards' : '전체 카드'}
            </p>
            {loading ? (
              <div className="h-8 bg-border rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-semibold text-fg">{stats?.totalCards ?? 0}</p>
            )}
          </div>

          {/* Mastered Rate */}
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <p className="text-xs text-fg-muted mb-2">
              {lang === 'en' ? 'Mastered' : '마스터한'}
            </p>
            {loading ? (
              <div className="h-8 bg-border rounded animate-pulse" />
            ) : (
              <>
                <p className="text-2xl font-semibold text-accent">
                  {stats && stats.totalCards > 0
                    ? Math.round((stats.masteredCards / stats.totalCards) * 100)
                    : 0}%
                </p>
              </>
            )}
          </div>

          {/* Review Due */}
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <p className="text-xs text-fg-muted mb-2">
              {lang === 'en' ? 'Due Today' : '오늘 복습'}
            </p>
            {loading ? (
              <div className="h-8 bg-border rounded animate-pulse" />
            ) : (
              <p className={`text-2xl font-semibold ${
                (stats?.dueCards ?? 0) > 0 ? 'text-orange-500' : 'text-fg'
              }`}>
                {stats?.dueCards ?? 0}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 🎯 Quick Actions */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          {lang === 'en' ? '🎯 Quick Actions' : '🎯 빠른 액션'}
        </h2>
        <div className="space-y-2">
          <a href="/exam" className="block rounded-lg border border-border bg-bg-secondary p-4 hover:border-accent hover:bg-bg-tertiary transition">
            <p className="text-sm font-medium text-fg">
              {lang === 'en' ? '📝 Take Practice Exam' : '📝 모의고사 시작'}
            </p>
            <p className="text-xs text-fg-muted mt-1">
              {lang === 'en' ? 'Test your knowledge' : '지식을 테스트해보세요'}
            </p>
          </a>
          <a href="/review" className="block rounded-lg border border-border bg-bg-secondary p-4 hover:border-accent hover:bg-bg-tertiary transition">
            <p className="text-sm font-medium text-fg">
              {lang === 'en' ? '🔄 Start Review' : '🔄 복습 시작'}
            </p>
            <p className="text-xs text-fg-muted mt-1">
              {lang === 'en' ? 'Review due cards' : '복습할 카드를 검토하세요'}
            </p>
          </a>
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
