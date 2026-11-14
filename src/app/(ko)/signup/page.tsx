import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';
import { listCerts } from '@/lib/content';
import { DEFAULT_CATEGORY } from '@/lib/category';
import { isGoogleLoginEnabled } from '@/lib/auth/oauth/google';

export default async function SignupPage() {
  const metas = await listCerts(DEFAULT_CATEGORY);
  const certs = metas.map((m) => ({ slug: m.slug, code: m.code, name: m.name }));
  return (
    <Suspense fallback={null}>
      <AuthForm mode="signup" certs={certs} googleEnabled={isGoogleLoginEnabled()} />
    </Suspense>
  );
}
