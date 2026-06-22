import { getCurrentUser } from '@/lib/auth/currentUser';
import { query } from '@/lib/db';
import { GrantProForm } from '@/components/admin/GrantProForm';
import { AdminWaitlist } from '@/components/admin/AdminWaitlist';
import { AdminUserList } from '@/components/admin/AdminUserList';
import { AdminStats } from '@/components/admin/AdminStats';
import { AdminFeedback } from '@/components/admin/AdminFeedback';
import { getAdminStats } from '@/lib/admin/stats';

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
  period_end: string | null; // 'YYYY-MM-DD'(KST), null=무기한
  days_left: number | null; // 만료까지 남은 일수, null=무기한
}

interface CountRow {
  pro: string;
  total: string;
}

interface FeedbackRow {
  id: number;
  phone: string;
  message: string;
  rewarded: boolean;
  created_at: string;
  email: string | null;
}

// /admin은 middleware에서 admin 역할만 통과시킨다.
export default async function AdminPage() {
  const user = await getCurrentUser();
  const [stats, waitlist, users, counts, feedback] = await Promise.all([
    getAdminStats(),
    query<WaitlistRow>(`SELECT email, to_char(created_at, 'YYYY-MM-DD') AS created_at FROM waitlist ORDER BY created_at DESC LIMIT 200`),
    query<UserRow>(`SELECT email, plan, role,
        to_char(current_period_end AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS period_end,
        CASE WHEN current_period_end IS NULL THEN NULL
             ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (current_period_end - now())) / 86400))::int END AS days_left
      FROM users ORDER BY created_at DESC LIMIT 500`),
    query<CountRow>(`SELECT count(*) FILTER (WHERE plan = 'pro') AS pro, count(*) AS total FROM users`),
    query<FeedbackRow>(`SELECT f.id, f.phone, f.message, f.rewarded,
        to_char(f.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS created_at,
        u.email AS email
      FROM feedback f LEFT JOIN users u ON u.id = f.user_id
      ORDER BY f.created_at DESC LIMIT 200`),
  ]);
  const c = counts[0] ?? { pro: '0', total: '0' };

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">관리자 대시보드</h1>
        <p className="text-sm text-fg-muted">{user?.email}님 · 전체 사용자 {c.total}명 / Pro {c.pro}명</p>
      </header>

      <AdminStats stats={stats} />

      <AdminWaitlist items={waitlist} />

      <AdminUserList users={users} />

      <AdminFeedback items={feedback} />

      <GrantProForm />
    </div>
  );
}
