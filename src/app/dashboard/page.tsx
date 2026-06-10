import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getDashboardData, type CertProgress } from '@/lib/dashboard/dashboardService';

export const dynamic = 'force-dynamic';

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return `${Math.floor(day / 30)}개월 전`;
}

function StatTile({ label, value, suffix, tone }: { label: string; value: number | string; suffix?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg-elevated px-4 py-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${tone ?? 'text-fg'}`}>
        {value}
        {suffix && <span className="ml-0.5 text-sm font-normal text-fg-faint">{suffix}</span>}
      </p>
    </div>
  );
}

function CertRow({ c }: { c: CertProgress }) {
  const pct = c.totalQuestions > 0 ? Math.round((c.attemptedQuestions / c.totalQuestions) * 100) : 0;
  const acc = c.attempts > 0 ? Math.round((c.correct / c.attempts) * 100) : null;
  return (
    <Link
      href={`/aws-certs/${c.slug}`}
      className="block rounded-lg border border-border bg-bg-elevated px-4 py-3 transition hover:border-border-strong"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono text-[11px] text-fg-faint">{c.code}</span>
          <span className="ml-2 text-sm text-fg">{c.name}</span>
        </div>
        <span className="shrink-0 text-xs text-fg-muted tabular-nums">
          {acc === null ? '미시작' : `정답률 ${acc}%`}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-subtle">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.accent }} />
        </div>
        <span className="shrink-0 text-[11px] text-fg-faint tabular-nums">
          {c.attemptedQuestions}/{c.totalQuestions}
        </span>
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard');

  const data = await getDashboardData(user.sub);
  const hasActivity = data.attempts > 0 || data.review.total > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-10">
      <header className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-wider text-fg-faint">Dashboard</p>
        <h1 className="text-2xl font-semibold tracking-tight">학습 대시보드</h1>
        <p className="text-sm text-fg-muted">{user.email}님의 학습 현황</p>
      </header>

      {!hasActivity ? (
        <div className="rounded-xl border border-border bg-bg-elevated p-8 text-center">
          <p className="mb-2 text-2xl">📊</p>
          <p className="mb-1 font-medium text-fg">아직 풀이 기록이 없어요</p>
          <p className="mb-4 text-sm text-fg-muted">자격증을 골라 연습 문제를 풀면 여기에 진도·정답률·복습 현황이 쌓입니다.</p>
          <Link href="/" className="text-sm text-accent underline underline-offset-4">학습 시작하기</Link>
        </div>
      ) : (
        <>
          {/* 핵심 지표: 정답률을 히어로로, 나머지는 보조 타일 */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 row-span-1 rounded-xl border border-accent/30 bg-accent/5 px-5 py-5 sm:col-span-2">
              <p className="text-xs text-fg-muted">전체 정답률</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-fg">
                {data.accuracy}<span className="text-xl font-normal text-fg-faint">%</span>
              </p>
              <p className="mt-1 text-xs text-fg-faint tabular-nums">
                {data.correct} / {data.attempts}문제 정답
              </p>
            </div>
            <StatTile label="푼 문제" value={data.attemptedQuestions} suffix={`/ ${data.totalQuestions}`} />
            <StatTile label="진도(커버리지)" value={data.coverage} suffix="%" />
            <StatTile label="복습 필요" value={data.review.due} tone={data.review.due > 0 ? 'text-danger' : 'text-fg'} />
            <StatTile label="마스터" value={data.review.mastered} tone="text-success" />
          </section>

          {/* 자격증별 진행 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-fg-muted">자격증별 진행</h2>
              {data.review.due > 0 && (
                <Link href="/review" className="text-xs text-accent underline underline-offset-4">
                  복습 시작 ({data.review.due})
                </Link>
              )}
            </div>
            <div className="space-y-2">
              {data.certs.map((c) => <CertRow key={c.slug} c={c} />)}
            </div>
          </section>

          {/* 최근 학습 */}
          {data.recent.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-fg-muted">최근 학습</h2>
              <ul className="space-y-1.5">
                {data.recent.map((r, i) => (
                  <li key={`${r.questionId}-${i}`}>
                    <Link
                      href={`/aws-certs/${r.slug}/week${r.week}/day${r.day}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-bg-elevated px-3 py-2 transition hover:border-border-strong"
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                          r.correct ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                        }`}
                      >
                        {r.correct ? '✓' : '✗'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.prompt}</span>
                      <span className="shrink-0 font-mono text-[10px] uppercase text-fg-faint">{r.slug} W{r.week}D{r.day}</span>
                      <span className="shrink-0 text-[11px] text-fg-faint">{relTime(r.attemptedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
