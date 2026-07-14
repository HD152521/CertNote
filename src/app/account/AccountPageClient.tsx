'use client';

import type { ProfileValues } from '@/components/account/ProfileSection';
import { AccountTabs } from '@/components/account/AccountTabs';

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
  return (
    <AccountTabs
      userEmail={userEmail}
      certs={certs}
      initial={initial}
      isPro={isPro}
      periodEnd={periodEnd}
      daysLeft={daysLeft}
    />
  );
}
