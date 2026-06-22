import type { AdminStats as Stats } from '@/lib/admin/stats';

function Card({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-2.5">
      <p className="text-[11px] text-fg-muted">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${tone ?? 'text-fg'}`}>{value}</p>
    </div>
  );
}

// 관리자 간략 지표. 상단 합계 카드 + 최근 14일 일별 표(가입/활동유저/풀이수).
export function AdminStats({ stats }: { stats: Stats }) {
  const { totals, daily } = stats;
  const maxActive = Math.max(1, ...daily.map((d) => d.active));

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">서비스 지표</h2>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Card label="전체 유저" value={totals.users} />
        <Card label="Pro" value={totals.pro} tone="text-accent" />
        <Card label="무료" value={totals.free} />
        <Card label="대기자" value={totals.waitlist} />
        <Card label="푸시 기기" value={totals.pushDevices} />
        <Card label="오늘 활동" value={totals.dauToday} tone="text-success" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-subtle text-xs text-fg-muted">
              <th className="px-3 py-1.5 text-left font-medium">날짜(최근 14일)</th>
              <th className="px-3 py-1.5 text-right font-medium">가입</th>
              <th className="px-3 py-1.5 text-right font-medium">활동 유저</th>
              <th className="px-3 py-1.5 text-right font-medium">풀이</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.date} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 font-mono text-xs text-fg-muted">{d.date}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{d.signups || '·'}</td>
                <td className="px-3 py-1.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="h-1.5 rounded-full bg-accent/60" style={{ width: `${(d.active / maxActive) * 56}px` }} />
                    <span className="w-6 tabular-nums">{d.active || '·'}</span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-fg-muted">{d.attempts || '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-fg-faint">활동 유저 = 그날 읽기·퀴즈·복습 중 하나라도 한 distinct 유저 (KST 기준).</p>
    </section>
  );
}
