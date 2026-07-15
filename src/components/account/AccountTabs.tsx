'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage, t } from '@/lib/i18n-client';
import type { ProfileValues } from '@/components/account/ProfileSection';
import type { CertOption } from '@/app/account/AccountPageClient';
import { DashboardTab } from './tabs/DashboardTab';
import { NotebookTab } from './tabs/NotebookTab';
import { ProfileTab } from './tabs/ProfileTab';
import { BillingTab } from './tabs/BillingTab';
import { SettingsTab } from './tabs/SettingsTab';

type TabId = 'dashboard' | 'notebook' | 'profile' | 'billing' | 'settings';

interface AccountTabsProps {
  userEmail: string;
  certs: CertOption[];
  initial: ProfileValues;
  isPro: boolean;
  periodEnd: string | null;
  daysLeft: number | null;
}

const TABS: Array<{ id: TabId; icon: string; label: { en: string; ko: string } }> = [
  { id: 'dashboard', icon: '📊', label: { en: 'Dashboard', ko: '대시보드' } },
  { id: 'notebook', icon: '📝', label: { en: 'Notebook', ko: '오답노트' } },
  { id: 'profile', icon: '👤', label: { en: 'Profile', ko: '프로필' } },
  { id: 'billing', icon: '💳', label: { en: 'Subscription & Billing', ko: '구독 & 결제' } },
  { id: 'settings', icon: '⚙️', label: { en: 'Settings', ko: '설정' } },
];

export function AccountTabs({
  userEmail,
  certs,
  initial,
  isPro,
  periodEnd,
  daysLeft,
}: AccountTabsProps) {
  const lang = useLanguage();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam || 'dashboard');

  function getTabLabel(tab: TabId): string {
    const tabDef = TABS.find((t) => t.id === tab);
    if (!tabDef) return '';
    return lang === 'en' ? tabDef.label.en : tabDef.label.ko;
  }

  return (
    <div className="mx-auto max-w-2xl py-12 px-4 md:px-0 space-y-0">
      {/* Sticky Header */}
      <div className="sticky top-14 z-40 bg-bg pb-4 mb-6">
        <div className="space-y-4">
          {/* Title Section */}
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">{t(lang, 'myPage')}</h1>
            <p className="text-sm text-fg-muted">{userEmail}</p>
          </div>

          {/* Tab Navigation - Horizontal Scrollable */}
          <div className="flex gap-1 border-b border-border overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-3 py-3 text-sm font-medium whitespace-nowrap
                  border-b-2 transition-all duration-200
                  ${
                    activeTab === tab.id
                      ? 'text-accent border-accent'
                      : 'text-fg-muted border-transparent hover:text-fg'
                  }
                `}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {getTabLabel(tab.id)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab Content Container */}
      <div className="space-y-8">
        {activeTab === 'dashboard' && (
          <DashboardTab isPro={isPro} periodEnd={periodEnd} daysLeft={daysLeft} />
        )}
        {activeTab === 'notebook' && <NotebookTab />}
        {activeTab === 'profile' && <ProfileTab certs={certs} initial={initial} />}
        {activeTab === 'billing' && (
          <BillingTab
            isPro={isPro}
            periodEnd={periodEnd}
            daysLeft={daysLeft}
          />
        )}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
