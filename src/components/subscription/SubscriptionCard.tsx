'use client';

import { Entitlement } from '@/lib/entitlement/types';
import { formatDate } from '@/lib/utils/date';

interface SubscriptionCardProps {
  entitlement: Entitlement;
  userId: string;
}

export function SubscriptionCard({ entitlement, userId }: SubscriptionCardProps) {
  const isPro = entitlement.isPro;
  const periodEnd = entitlement.periodEnd ? new Date(entitlement.periodEnd) : null;
  const daysRemaining = periodEnd
    ? Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="rounded-lg border border-border-secondary bg-bg-secondary p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            현재 플랜: <span className={isPro ? 'text-accent' : 'text-fg-secondary'}>
              {isPro ? 'Pro' : 'Free'}
            </span>
          </h2>
          <p className="mt-2 text-sm text-fg-secondary">
            {isPro ? (
              <>
                모든 자격증과 모의고사에 접근 가능합니다.
                {periodEnd && (
                  <div className="mt-2">
                    {daysRemaining && daysRemaining > 0 ? (
                      <>
                        <span className="font-medium">갱신일:</span> {formatDate(periodEnd)} ({daysRemaining}일 남음)
                      </>
                    ) : (
                      <span className="text-red-600">구독이 만료되었습니다</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>각 자격증의 Week1만 접근 가능합니다.</>
            )}
          </p>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
          isPro ? 'bg-accent/20 text-accent' : 'bg-fg-tertiary text-fg-secondary'
        }`}>
          {isPro ? '활성' : '무료'}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex flex-wrap gap-3">
        {!isPro && (
          <a
            href="/checkout"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent/90"
          >
            Pro로 업그레이드
          </a>
        )}
        {isPro && (
          <button className="rounded-lg border border-border-secondary px-4 py-2 text-sm font-semibold hover:bg-bg-tertiary">
            결제 정보 변경
          </button>
        )}
        {isPro && (
          <button className="rounded-lg border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/10">
            구독 취소
          </button>
        )}
      </div>
    </div>
  );
}
