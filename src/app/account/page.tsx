import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { query } from '@/lib/db';
import { listCerts } from '@/lib/content';
import { DEFAULT_CATEGORY } from '@/lib/category';
import { AccountPageClient } from './AccountPageClient';
import { type ProfileValues } from '@/components/account/ProfileSection';

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
    <AccountPageClient
      userEmail={user.email}
      certs={certs}
      initial={initial}
      isPro={isPro}
      periodEnd={row?.period_end ?? null}
      daysLeft={row?.days_left ?? null}
    />
  );
}
