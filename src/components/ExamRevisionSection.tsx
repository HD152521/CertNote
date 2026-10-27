import { ExternalLink } from 'lucide-react';
import type { ExamDomain, ExamRevision } from '@/lib/examInfo';
import BulletList from '@/components/ui/BulletList';
import { withAnd } from '@/lib/koParticle';

interface ExamRevisionSectionProps {
  code: string; // 현재 버전 코드(예: 'DOP-C02')
  revision: ExamRevision;
  domains: ExamDomain[]; // 현재 버전 도메인(ExamInfo.domains)
}

// "2023-03-07" → "2023년 3월 7일". 날짜 객체를 거치지 않아 시간대에 따라 하루 밀리지 않는다.
export function formatKoDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

function DomainList({ title, domains }: { title: string; domains: ExamDomain[] }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <h4 className="font-mono text-xs text-fg-faint">{title}</h4>
      <ul className="space-y-1 text-sm">
        {domains.map((d) => (
          <li key={d.name} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-fg">{d.name}</span>
            {typeof d.weight === 'number' && <span className="shrink-0 tabular-nums text-fg-muted">{d.weight}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// 자격증 허브의 "이전 버전과의 차이" 섹션. 한국어 화면 전용이다 — 문구가 한국어라 영어판(lang="en")에
// 실으면 본문 언어가 섞인다. 제목을 "DOP-C01과 DOP-C02 차이"로 두는 건 실제 유입 검색어
// ("dop-c01 c02 차이")와 같은 표현이어서다.
export default function ExamRevisionSection({ code, revision, domains }: ExamRevisionSectionProps) {
  const { previousCode, oldUntil, newSince, oldDomains, changes, sources, checkedAt } = revision;
  return (
    <section aria-labelledby="exam-revision-heading" className="space-y-4">
      <h2 id="exam-revision-heading" className="text-xl font-semibold tracking-tight">
        {withAnd(previousCode)} {code} 차이
      </h2>
      {(newSince || oldUntil) && (
        <p className="text-sm leading-relaxed text-fg-muted">
          {newSince && <>{code} 시험은 {formatKoDate(newSince)}부터 응시할 수 있습니다. </>}
          {oldUntil && <>{previousCode} 시험은 {formatKoDate(oldUntil)}이 마지막 응시일이었습니다.</>}
        </p>
      )}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-fg">달라진 점</h3>
        <BulletList items={changes} />
      </div>
      {oldDomains && oldDomains.length > 0 && domains.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-fg">도메인 구성 비교</h3>
          <div className="grid gap-4 rounded-lg border border-border bg-bg-elevated p-4 sm:grid-cols-2">
            <DomainList title={previousCode} domains={oldDomains} />
            <DomainList title={code} domains={domains} />
          </div>
        </div>
      )}
      <p className="text-xs leading-relaxed text-fg-faint">
        출처:{' '}
        {sources.map((url, i) => (
          <span key={url}>
            {i > 0 && ', '}
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-fg">
              AWS 공식 문서{sources.length > 1 ? ` ${i + 1}` : ''} <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        ))}{' '}
        · {formatKoDate(checkedAt)} 확인
      </p>
    </section>
  );
}
