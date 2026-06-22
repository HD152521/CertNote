import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { query } from '@/lib/db';
import { AdminStats } from '@/components/admin/AdminStats';
import { AdminFeedback } from '@/components/admin/AdminFeedback';
import { getAdminStats } from '@/lib/admin/stats';

// 쿠키·DB를 읽으므로 항상 동적 렌더.
export const dynamic = 'force-dynamic';

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
  const [stats, counts, feedback] = await Promise.all([
    getAdminStats(),
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

      <nav className="flex flex-wrap gap-2">
        <Link href="/admin/users" className="rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium transition hover:bg-fg/5">
          유저 관리 (대기자 승인 · Pro 부여/해지) →
        </Link>
      </nav>

      <AdminStats stats={stats} />

      <AdminFeedback items={feedback} />
    </div>
  );
}
