import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { listCertOptions } from '@/lib/certOptions';
import { isGoogleLoginEnabled } from '@/lib/auth/oauth/google';

export default async function SignupPage() {
  const certs = await listCertOptions();
  return (
    <Suspense fallback={null}>
      <AuthForm mode="signup" certs={certs} googleEnabled={isGoogleLoginEnabled()} />
    </Suspense>
  );
}
