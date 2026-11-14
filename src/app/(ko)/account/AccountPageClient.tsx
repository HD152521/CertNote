'use client';

import type { ProfileValues } from '@/components/account/ProfileSection';
import { AccountSections } from '@/components/account/AccountSections';

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
  hasPassword: boolean;
  emailVerified: boolean;
}

export function AccountPageClient({
  userEmail,
  certs,
  initial,
  isPro,
  periodEnd,
  daysLeft,
  hasPassword,
  emailVerified,
}: AccountPageClientProps) {
  return (
    <AccountSections
      userEmail={userEmail}
      certs={certs}
      initial={initial}
      isPro={isPro}
      periodEnd={periodEnd}
      daysLeft={daysLeft}
      hasPassword={hasPassword}
      emailVerified={emailVerified}
    />
  );
}
