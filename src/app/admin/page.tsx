import { getCurrentUser } from '@/lib/auth/currentUser';
import { query } from '@/lib/db';
import { GrantProForm } from '@/components/admin/GrantProForm';
import { AdminWaitlist } from '@/components/admin/AdminWaitlist';
import { AdminUserList } from '@/components/admin/AdminUserList';

// 쿠키·DB를 읽으므로 항상 동적 렌더.
export const dynamic = 'force-dynamic';

interface WaitlistRow {
  email: string;
  created_at: string; // SQL에서 to_char로 'YYYY-MM-DD' 문자열로 받음(node-pg의 Date 반환·slice 크래시 회피)
}

interface UserRow {
  email: string;
  plan: string;
  role: string;
}

interface CountRow {
  pro: string;
  total: string;
}

// /admin은 middleware에서 admin 역할만 통과시킨다.
export default async function AdminPage() {
  const user = await getCurrentUser();
  const [waitlist, users, counts] = await Promise.all([
    query<WaitlistRow>(`SELECT email, to_char(created_at, 'YYYY-MM-DD') AS created_at FROM waitlist ORDER BY created_at DESC LIMIT 200`),
    query<UserRow>(`SELECT email, plan, role FROM users ORDER BY created_at DESC LIMIT 500`),
    query<CountRow>(`SELECT count(*) FILTER (WHERE plan = 'pro') AS pro, count(*) AS total FROM users`),
  ]);
  const c = counts[0] ?? { pro: '0', total: '0' };

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">관리자 대시보드</h1>
        <p className="text-sm text-fg-muted">{user?.email}님 · 전체 사용자 {c.total}명 / Pro {c.pro}명</p>
      </header>

      <AdminWaitlist items={waitlist} />

      <AdminUserList users={users} />

      <GrantProForm />
    </div>
  );
}
