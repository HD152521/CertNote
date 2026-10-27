import { CERT_CANDIDATES, OTHER_CERT_KEY } from '@/lib/userInput/certCandidates';

export interface CertRequestTally {
  cert_key: string;
  other_name: string | null;
  total: number;
  emails: string[]; // 알림 받을 이메일(직접 입력 + 로그인 계정), 중복 제거
}

function labelOf(key: string, otherName: string | null): string {
  if (key === OTHER_CERT_KEY) return `기타: ${otherName ?? ''}`;
  // 후보에서 빠진(출시된) key 도 그대로 보여 준다.
  return CERT_CANDIDATES.find((c) => c.key === key)?.label ?? key;
}

// 관리자: 자격증 요청 집계. 공개 화면에는 숫자를 내지 않으므로 여기서만 본다.
export function AdminCertRequests({ items }: { items: CertRequestTally[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">자격증 요청 ({items.reduce((n, r) => n + r.total, 0)})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-fg-faint">아직 받은 요청이 없습니다.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((r) => (
            <li key={`${r.cert_key}:${r.other_name ?? ''}`} className="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-fg">{labelOf(r.cert_key, r.other_name)}</span>
                <span className="font-mono text-xs text-fg-muted">{r.total}건 · 알림 {r.emails.length}명</span>
              </div>
              {r.emails.length > 0 && (
                <details className="mt-1 text-xs text-fg-faint">
                  <summary className="cursor-pointer">알림 이메일</summary>
                  <p className="mt-1 break-all">{r.emails.join(', ')}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
