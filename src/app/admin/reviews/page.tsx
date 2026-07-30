import Link from 'next/link';
import { listAllReviews } from '@/lib/reviews/reviewsRepository';
import { AdminReviewToggle } from '@/components/admin/AdminReviewToggle';

// /admin 이하는 middleware가 admin 역할만 통과시킨다. 쿠키·DB를 읽으므로 동적 렌더.
export const dynamic = 'force-dynamic';

export default async function AdminReviewsPage() {
  const reviews = await listAllReviews();
  const visible = reviews.filter((r) => !r.hidden).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <header className="space-y-1">
        <Link href="/admin" className="font-mono text-xs text-fg-muted hover:text-fg">← admin</Link>
        <h1 className="text-2xl font-semibold tracking-tight">후기 관리</h1>
        <p className="text-sm text-fg-muted">전체 {reviews.length}개 · 노출 {visible}개 · 숨김 {reviews.length - visible}개</p>
      </header>

      {reviews.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-bg-subtle/40 px-4 py-8 text-center text-sm text-fg-muted">
          아직 후기가 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li
              key={r.id}
              className={`space-y-1.5 rounded-lg border p-4 ${r.hidden ? 'border-border bg-bg-subtle/40 opacity-70' : 'border-border bg-bg-elevated'}`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                <span className="font-mono uppercase text-fg-faint">{r.section}/{r.certSlug}</span>
                <span className="tabular-nums">★ {r.rating}</span>
                {r.passed === true && <span className="text-accent">합격</span>}
                {r.passed === false && <span>불합격</span>}
                <span>{r.authorName}</span>
                <span className="text-fg-faint">{r.createdAt}</span>
                {r.hidden && <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-red-500">숨김</span>}
                <span className="ml-auto"><AdminReviewToggle id={r.id} hidden={r.hidden} /></span>
              </div>
              {r.title && <p className="text-sm font-semibold text-fg">{r.title}</p>}
              <p className="whitespace-pre-line text-sm leading-relaxed text-fg-muted">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
