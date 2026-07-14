'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { AuthForm } from '@/components/AuthForm';
import { isGoogleLoginEnabled } from '@/lib/auth/oauth/google';
import { useLanguage, t } from '@/lib/i18n-client';

export default function LoginPage() {
  const lang = useLanguage();
  return (
    <Suspense fallback={null}>
      <AuthForm mode="login" googleEnabled={isGoogleLoginEnabled()} />
      <p className="mx-auto mt-4 max-w-sm text-center text-xs text-fg-faint">
        <Link href="/forgot" className="text-accent hover:underline">{t(lang, 'forgotPasswordQuestion')}</Link>
      </p>
    </Suspense>
  );
}
