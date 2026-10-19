'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CreditCard, LayoutDashboard, NotebookPen, Settings, User, type LucideIcon } from 'lucide-react';
import { useLanguage, t } from '@/lib/i18n-client';
import type { ProfileValues } from '@/components/account/ProfileSection';
import type { CertOption } from '@/app/account/AccountPageClient';
import { NotebookTab } from './tabs/NotebookTab';
import { ProfileTab } from './tabs/ProfileTab';
import { BillingTab } from './tabs/BillingTab';
import { PAYWALL_ENABLED } from '@/lib/entitlement/policy';
import { SettingsTab } from './tabs/SettingsTab';
import { ResendVerifyButton } from '@/components/auth/ResendVerifyButton';
import { pick } from '@/lib/strings/dict';
import { verifyStrings } from '@/lib/strings/verify';

type TabId = 'profile' | 'notebook' | 'billing' | 'settings';

interface AccountTabsProps {
  userEmail: string;
  certs: CertOption[];
  initial: ProfileValues;
  isPro: boolean;
  periodEnd: string | null;
  daysLeft: number | null;
  hasPassword: boolean;
  emailVerified: boolean;
}

// 구독제 보류 중(policy.ts PAYWALL_ENABLED=false)에는 '구독 & 결제' 탭을 숨긴다.
const ALL_TABS: Array<{ id: TabId; Icon: LucideIcon; label: { en: string; ko: string } }> = [
  { id: 'profile', Icon: User, label: { en: 'Profile', ko: '프로필' } },
  { id: 'notebook', Icon: NotebookPen, label: { en: 'Notebook', ko: '오답노트' } },
  { id: 'billing', Icon: CreditCard, label: { en: 'Subscription', ko: '구독 & 결제' } },
  { id: 'settings', Icon: Settings, label: { en: 'Settings', ko: '설정' } },
];
const TABS = ALL_TABS.filter((tab) => PAYWALL_ENABLED || tab.id !== 'billing');

const VALID_TABS = new Set<TabId>(TABS.map((tab) => tab.id));

export function AccountTabs({
  userEmail,
  certs,
  initial,
  isPro,
  periodEnd,
  daysLeft,
  hasPassword,
  emailVerified,
}: AccountTabsProps) {
  const lang = useLanguage();
  const vs = pick(verifyStrings, lang);
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId | null;
  // 구버전 '?tab=dashboard' 북마크 등 미지의 값은 프로필로 폴백.
  const [activeTab, setActiveTab] = useState<TabId>(tabParam && VALID_TABS.has(tabParam) ? tabParam : 'profile');

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:px-0">
      {/* Header */}
      <div className="sticky top-14 z-30 -mx-4 bg-bg px-4 pb-3 md:mx-0 md:px-0">
        <div className="space-y-1 pt-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t(lang, 'myPage')}</h1>
          <p className="text-sm text-fg-muted">{userEmail}</p>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map(({ id, Icon, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? 'border-accent text-accent' : 'border-transparent text-fg-muted hover:text-fg'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {lang === 'en' ? label.en : label.ko}
              </button>
            );
          })}
        </div>
      </div>

      {/* 계정 정보(이메일) 바로 아래. 미인증 계정만(서버 값) — 구글 계정은 가입 시 인증된 것으로 저장돼 보이지 않는다.
          스티키 헤더 밖에 둬 스크롤 중 화면을 가리지 않게 한다. */}
      {!emailVerified && (
        <div className="mt-4 rounded-md border border-warning/40 bg-warning/5 px-3 py-2.5">
          <p className="text-sm font-medium text-fg">{vs.emailNotVerified}</p>
          <p className="mt-0.5 text-xs text-fg-muted">{vs.emailNotVerifiedHint}</p>
          <ResendVerifyButton className="mt-2" />
        </div>
      )}

      {/* Learning status lives in the dashboard — link out instead of duplicating it here. */}
      <Link
        href="/dashboard"
        className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-bg-elevated px-4 py-3 transition hover:border-border-strong"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <LayoutDashboard className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">
            {lang === 'en' ? 'Learning Dashboard' : '학습 대시보드'}
          </span>
          <span className="block truncate text-xs text-fg-muted">
            {lang === 'en' ? 'Progress, accuracy, review status, and recommendations' : '진도 · 정답률 · 복습 현황 · 오늘의 추천'}
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
      </Link>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === 'profile' && <ProfileTab certs={certs} initial={initial} />}
        {activeTab === 'notebook' && <NotebookTab />}
        {activeTab === 'billing' && <BillingTab isPro={isPro} periodEnd={periodEnd} daysLeft={daysLeft} />}
        {activeTab === 'settings' && <SettingsTab hasPassword={hasPassword} userEmail={userEmail} />}
      </div>
    </div>
  );
}
