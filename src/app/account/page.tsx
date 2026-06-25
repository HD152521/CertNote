import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { query } from '@/lib/db';
import { listCerts } from '@/lib/content';
import { DEFAULT_CATEGORY } from '@/lib/category';
import { AccountForms } from './AccountForms';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';
import { ProfileSection, type ProfileValues } from '@/components/account/ProfileSection';

// 계정 관리 페이지. 미들웨어(/account)에 더해 서버에서도 getCurrentUser로 권위 확인
// (token_version 무효화 반영). 비로그인 시 로그인으로 리다이렉트.
export const dynamic = 'force-dynamic';

interface ProfileRow {
  name: string | null;
  birthdate: string | null;
  occupation: string | null;
  target_cert: string | null;
  purpose: string | null;
  experience_level: string | null;
  plan: string;
  period_end: string | null;
  days_left: number | null;
}

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/account');
  }

  const [rows, metas] = await Promise.all([
    query<ProfileRow>(
      `SELECT name, to_char(birthdate, 'YYYY-MM-DD') AS birthdate, occupation, target_cert, purpose, experience_level,
              plan,
              to_char(current_period_end AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS period_end,
              CASE WHEN current_period_end IS NULL THEN NULL
                   ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (current_period_end - now())) / 86400))::int END AS days_left
         FROM users WHERE id = $1`,
      [user.sub],
    ),
    listCerts(DEFAULT_CATEGORY),
  ]);

  const row = rows[0];
  const certs = metas.map((m) => ({ slug: m.slug, code: m.code, name: m.name }));
  const initial: ProfileValues = {
    name: row?.name ?? '',
    birthdate: row?.birthdate ?? '',
    occupation: row?.occupation ?? '',
    targetCert: row?.target_cert ?? '',
    purpose: row?.purpose ?? '',
    experienceLevel: row?.experience_level ?? '',
  };
  const isPro = row?.plan === 'pro';

  return (
    <div className="mx-auto max-w-sm space-y-8 py-16">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">마이페이지</h1>
        <p className="text-sm text-fg-muted">{user.email}</p>
      </div>

      {/* 구독 상태 */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">구독</h2>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${isPro ? 'bg-accent/10 text-accent' : 'bg-bg-subtle text-fg-faint'}`}>
              {isPro ? 'Pro' : 'Free'}
            </span>
            {isPro && (
              <span className="text-xs text-fg-muted">
                {row?.period_end === null ? '무기한' : `~${row?.period_end} · ${row?.days_left}일 남음`}
              </span>
            )}
          </div>
          {!isPro && (
            <Link href="/pricing" className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg">업그레이드</Link>
          )}
        </div>
        <Link href="/dashboard" className="inline-block text-xs text-fg-muted underline underline-offset-4 hover:text-fg">
          학습 통계 보기 →
        </Link>
      </section>

      <ProfileSection certs={certs} initial={initial} />
      <NotificationSettings />
      <AccountForms />
    </div>
  );
}
