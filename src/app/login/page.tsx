import { Suspense } from 'react';
import Link from 'next/link';
import { AuthForm } from '@/components/AuthForm';
import { isGoogleLoginEnabled } from '@/lib/auth/oauth/google';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="login" googleEnabled={isGoogleLoginEnabled()} />
      <p className="mx-auto mt-4 max-w-sm text-center text-xs text-fg-faint">
        <Link href="/forgot" className="text-accent hover:underline">비밀번호를 잊으셨나요?</Link>
      </p>
    </Suspense>
  );
}
