'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CERT_CANDIDATES, OTHER_CERT_KEY } from '@/lib/userInput/certCandidates';

export interface CertRequestTally {
  cert_key: string;
  other_name: string | null;
  total: number;
  members: number; // 로그인 사용자 요청 수(계정당 1건). 나머지는 비로그인(중복을 거를 수 없음).
  pending_emails: string[]; // 아직 출시 알림을 보내지 않은 요청자의 계정 이메일
}

function labelOf(key: string, otherName: string | null): string {
  if (key === OTHER_CERT_KEY) return `기타: ${otherName ?? ''}`;
  // 후보에서 빠진(출시된) key 도 그대로 보여 준다.
  return CERT_CANDIDATES.find((c) => c.key === key)?.label ?? key;
}

// 관리자: 자격증 요청 집계. 공개 화면에는 숫자를 내지 않으므로 여기서만 본다.
// 출시 후 pending_emails 로 알림을 보내고 "알림 보냄"을 누르면 목록에서 빠진다.
export function AdminCertRequests({ items }: { items: CertRequestTally[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function markNotified(r: CertRequestTally) {
    const key = `${r.cert_key}:${r.other_name ?? ''}`;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch('/api/admin/cert-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certKey: r.cert_key, otherName: r.other_name ?? '' }),
      });
      if (!res.ok) {
        setError(`처리하지 못했습니다(${res.status}). 다시 로그인한 뒤 시도해 주세요.`);
        return;
      }
      router.refresh();
    } catch {
      setError('처리하지 못했습니다. 네트워크를 확인해 주세요.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">자격증 요청 ({items.reduce((n, r) => n + r.total, 0)})</h2>
      {error && <p className="text-xs text-danger">{error}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-fg-faint">아직 받은 요청이 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((r) => {
            const key = `${r.cert_key}:${r.other_name ?? ''}`;
            return (
              <li key={key} className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-fg">{labelOf(r.cert_key, r.other_name)}</span>
                  <span className="font-mono text-xs text-fg-muted">
                    {r.total}건 (회원 {r.members} · 비회원 {r.total - r.members})
                  </span>
                </div>
                {r.pending_emails.length > 0 && (
                  <details className="mt-1 text-xs text-fg-faint">
                    <summary className="cursor-pointer">알림 보낼 이메일 {r.pending_emails.length}명</summary>
                    <p className="mt-1 break-all">{r.pending_emails.join(', ')}</p>
                    <button type="button" disabled={busy === key} onClick={() => markNotified(r)}
                      className="mt-1.5 rounded-md border border-border px-2.5 py-1 font-medium text-fg-muted transition hover:text-fg disabled:opacity-50">
                      알림 보냄으로 표시
                    </button>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
