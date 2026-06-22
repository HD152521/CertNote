import Link from 'next/link';
import { query } from '@/lib/db';
import { GrantProForm } from '@/components/admin/GrantProForm';
import { AdminWaitlist } from '@/components/admin/AdminWaitlist';
import { AdminUserList } from '@/components/admin/AdminUserList';

// /admin 이하는 middleware에서 admin 역할만 통과. 쿠키·DB를 읽으므로 동적 렌더.
export const dynamic = 'force-dynamic';

interface WaitlistRow {
  email: string;
  created_at: string;
}

interface UserRow {
  email: string;
  plan: string;
  role: string;
  period_end: string | null;
  days_left: number | null;
}

export default async function AdminUsersPage() {
  const [waitlist, users] = await Promise.all([
    query<WaitlistRow>(`SELECT email, to_char(created_at, 'YYYY-MM-DD') AS created_at FROM waitlist ORDER BY created_at DESC LIMIT 200`),
    query<UserRow>(`SELECT email, plan, role,
        to_char(current_period_end AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS period_end,
        CASE WHEN current_period_end IS NULL THEN NULL
             ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (current_period_end - now())) / 86400))::int END AS days_left
      FROM users ORDER BY created_at DESC LIMIT 500`),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-12">
      <header className="space-y-1">
        <Link href="/admin" className="text-xs text-fg-muted hover:text-fg">← 대시보드</Link>
        <h1 className="text-2xl font-semibold tracking-tight">유저 관리</h1>
        <p className="text-sm text-fg-muted">대기자 승인 · Pro 부여/해지</p>
      </header>

      <AdminWaitlist items={waitlist} />
      <AdminUserList users={users} />
      <GrantProForm />
    </div>
  );
}
