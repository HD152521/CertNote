'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export interface QuestionReportItem {
  id: number;
  questionId: string;
  reason: string;
  message: string | null;
  status: string;
  created_at: string; // 'YYYY-MM-DD'
  prompt: string | null; // 문제 원문 앞부분(문제가 사라졌으면 null)
  href: string | null; // day 문제면 해당 페이지
}

const REASON_LABEL: Record<string, string> = {
  answer: '정답 오류',
  explanation: '해설 오류',
  outdated: '최신 내용과 다름',
  typo: '오타·표현',
  other: '기타',
};

// 관리자: 문제 오류 신고 목록. 미처리(open)가 위로 온다. 고쳤으면 '고침', 문제없으면 '문제없음'.
export function AdminQuestionReports({ items }: { items: QuestionReportItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const openCount = items.filter((r) => r.status === 'open').length;

  async function setStatus(id: number, status: string) {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/question-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">문제 오류 신고 (미처리 {openCount} / 전체 {items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-fg-faint">아직 받은 신고가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className={`rounded-lg border border-border bg-bg-elevated p-3 text-sm ${r.status === 'open' ? '' : 'opacity-60'}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <span className="rounded bg-danger/10 px-1.5 py-0.5 font-medium text-danger">{REASON_LABEL[r.reason] ?? r.reason}</span>
                {r.href ? (
                  <Link href={r.href} className="font-mono underline underline-offset-4 hover:text-fg">{r.questionId}</Link>
                ) : (
                  <span className="font-mono">{r.questionId}</span>
                )}
                <span className="text-fg-faint">· {r.created_at}</span>
              </div>
              {r.prompt && <p className="mt-1.5 line-clamp-2 text-fg-muted">{r.prompt}</p>}
              {r.message && <p className="mt-1.5 whitespace-pre-wrap text-fg">{r.message}</p>}
              <div className="mt-2 flex gap-1.5">
                {[['open', '미처리'], ['resolved', '고침'], ['dismissed', '문제없음']].map(([value, label]) => (
                  <button key={value} type="button" disabled={busy === r.id || r.status === value} onClick={() => setStatus(r.id, value)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-default ${
                      r.status === value ? 'bg-fg/10 text-fg' : 'border border-border text-fg-muted hover:text-fg'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
