'use client';

import { useLanguage } from '@/lib/i18n-client';
import { ProfileSection, type ProfileValues } from '@/components/account/ProfileSection';
import type { CertOption } from '@/app/account/AccountPageClient';

interface ProfileTabProps {
  certs: CertOption[];
  initial: ProfileValues;
}

export function ProfileTab({ certs, initial }: ProfileTabProps) {
  const lang = useLanguage();

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        {lang === 'en'
          ? 'Update your personal information and learning preferences.'
          : '개인정보 및 학습 선호도를 업데이트하세요.'}
      </p>
      <ProfileSection certs={certs} initial={initial} />
    </div>
  );
}
