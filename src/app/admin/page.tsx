import { getCurrentUser } from '@/lib/auth/currentUser';
import { query } from '@/lib/db';
import { GrantProForm } from '@/components/admin/GrantProForm';

interface WaitlistRow {
  email: string;
  created_at: string;
}

interface CountRow {
  pro: string;
  total: string;
}

// /admin은 middleware에서 admin 역할만 통과시킨다.
export default async function AdminPage() {
  const user = await getCurrentUser();
  const [waitlist, counts] = await Promise.all([
    query<WaitlistRow>('SELECT email, created_at FROM waitlist ORDER BY created_at DESC LIMIT 200'),
    query<CountRow>(`SELECT count(*) FILTER (WHERE plan = 'pro') AS pro, count(*) AS total FROM users`),
  ]);
  const c = counts[0] ?? { pro: '0', total: '0' };

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">관리자 대시보드</h1>
        <p className="text-sm text-fg-muted">{user?.email}님 · 전체 사용자 {c.total}명 / Pro {c.pro}명</p>
      </header>

      <GrantProForm />

      <section className="space-y-2">
        <h2 className="text-sm font-medium">업그레이드 대기자 ({waitlist.length})</h2>
        {waitlist.length === 0 ? (
          <p className="text-sm text-fg-faint">아직 대기자가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {waitlist.map((w, i) => (
              <li key={`${w.email}-${i}`} className="flex items-center justify-between px-3 py-2">
                <span>{w.email}</span>
                <span className="text-xs text-fg-faint">{w.created_at.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
