'use client';

import { useLanguage, t } from '@/lib/i18n-client';
import type { ProfileValues } from '@/components/account/ProfileSection';
import type { CertOption } from '@/app/account/AccountPageClient';
import { ProfileTab } from './tabs/ProfileTab';
import { BillingTab } from './tabs/BillingTab';
import { SettingsTab } from './tabs/SettingsTab';
import { PAYWALL_ENABLED } from '@/lib/entitlement/policy';
import { ResendVerifyButton } from '@/components/auth/ResendVerifyButton';
import { pick } from '@/lib/strings/dict';
import { verifyStrings } from '@/lib/strings/verify';

interface AccountSectionsProps {
  userEmail: string;
  certs: CertOption[];
  initial: ProfileValues;
  isPro: boolean;
  periodEnd: string | null;
  daysLeft: number | null;
  hasPassword: boolean;
  emailVerified: boolean;
}

const HEADINGS = {
  profile: { ko: '프로필', en: 'Profile' },
  billing: { ko: '구독 & 결제', en: 'Subscription' },
  settings: { ko: '알림 · 계정', en: 'Notifications & account' },
} as const;

// 마이페이지는 계정 정보만 둔다: 프로필, (구독제를 켜면) 결제, 알림·계정. 탭 없이 한 화면에 쌓는다.
// 학습 현황은 /dashboard, 오답노트는 /notebook 에 있다(예전 ?tab=notebook 주소는 page.tsx 가 /notebook 으로 보낸다).
export function AccountSections({
  userEmail,
  certs,
  initial,
  isPro,
  periodEnd,
  daysLeft,
  hasPassword,
  emailVerified,
}: AccountSectionsProps) {
  const lang = useLanguage();
  const vs = pick(verifyStrings, lang);
  const h = (key: keyof typeof HEADINGS) => HEADINGS[key][lang === 'en' ? 'en' : 'ko'];

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-10 md:px-0">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{t(lang, 'myPage')}</h1>
        <p className="text-sm text-fg-muted">{userEmail}</p>
      </div>

      {/* 미인증 계정만(서버 값) — 구글 계정은 가입 시 인증된 것으로 저장돼 보이지 않는다. */}
      {!emailVerified && (
        <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2.5">
          <p className="text-sm font-medium text-fg">{vs.emailNotVerified}</p>
          <p className="mt-0.5 text-xs text-fg-muted">{vs.emailNotVerifiedHint}</p>
          <ResendVerifyButton className="mt-2" />
        </div>
      )}

      <Section id="profile" title={h('profile')}>
        <ProfileTab certs={certs} initial={initial} />
      </Section>
      {PAYWALL_ENABLED && (
        <Section id="billing" title={h('billing')}>
          <BillingTab isPro={isPro} periodEnd={periodEnd} daysLeft={daysLeft} />
        </Section>
      )}
      <Section id="settings" title={h('settings')}>
        <SettingsTab hasPassword={hasPassword} userEmail={userEmail} />
      </Section>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 space-y-4 rounded-2xl border border-border bg-bg-elevated p-5 sm:p-6">
      <h2 id={`${id}-h`} className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}
