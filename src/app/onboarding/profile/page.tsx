import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { listCerts } from '@/lib/content';
import { DEFAULT_CATEGORY } from '@/lib/category';
import { query } from '@/lib/db';
import { OnboardingProfileForm } from '@/components/OnboardingProfileForm';

export const metadata = { title: '프로필 등록' };
// 로그인 쿠키·DB를 읽으므로 항상 동적.
export const dynamic = 'force-dynamic';

// 소셜 신규 가입 직후 1회 프로필 보완. 이미 프로필이 있으면(일반 가입·재방문) 홈으로.
export default async function OnboardingProfilePage() {
  const session = await getCurrentUser();
  if (!session) redirect('/login');

  const rows = await query<{ name: string | null; target_cert: string | null }>(
    'SELECT name, target_cert FROM users WHERE id = $1',
    [session.sub],
  );
  const me = rows[0];
  if (!me) redirect('/login');
  if (me.target_cert) redirect('/'); // 이미 등록된 사용자 — 온보딩 불필요.

  const metas = await listCerts(DEFAULT_CATEGORY);
  const certs = metas.map((m) => ({ slug: m.slug, code: m.code, name: m.name }));
  return (
    <Suspense fallback={null}>
      <OnboardingProfileForm certs={certs} initialName={me.name ?? ''} />
    </Suspense>
  );
}
