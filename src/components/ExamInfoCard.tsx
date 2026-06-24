import { ExternalLink } from 'lucide-react';
import type { ExamInfo } from '@/lib/examInfo';

interface ExamInfoCardProps {
  info: ExamInfo;
}

interface FactProps {
  label: string;
  value: string;
}

function Fact({ label, value }: FactProps) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-bg-subtle px-3 py-2.5">
      <dt className="truncate text-xs text-fg-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums text-fg">{value}</dd>
    </div>
  );
}

interface MetaRowProps {
  label: string;
  value: string;
}

function MetaRow({ label, value }: MetaRowProps) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <span className="shrink-0 text-xs text-fg-faint sm:w-20">{label}</span>
      <span className="min-w-0 text-sm text-fg-muted">{value}</span>
    </div>
  );
}

export default function ExamInfoCard({ info }: ExamInfoCardProps) {
  return (
    <section
      aria-labelledby="exam-info-heading"
      className="space-y-5 rounded-lg border border-border bg-bg-elevated p-4 sm:p-5"
    >
      <h2 id="exam-info-heading" className="text-sm font-medium text-fg-muted">
        시험 정보
      </h2>

      {/* 핵심 수치: 모바일 2열, sm 3열, lg 5열로 깔끔하게 줄바꿈 */}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Fact label="문항 수" value={`${info.questionCount}문항`} />
        <Fact label="시험 시간" value={`${info.durationMin}분`} />
        <Fact label="합격 점수" value={`${info.passingScore} / ${info.scoreMax}`} />
        <Fact label="응시료" value={`$${info.costUsd}`} />
        <Fact label="유효기간" value={`${info.validityYears}년`} />
      </dl>

      {/* 도메인 비중: 가로 막대 (대시보드 도메인 막대 스타일 재사용) */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-medium uppercase tracking-wider text-fg-faint">
          도메인 비중
        </h3>
        <div className="space-y-2.5">
          {info.domains.map((d) => (
            <div key={d.name}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 flex-1 truncate text-fg">{d.name}</span>
                <span className="shrink-0 tabular-nums text-fg-muted">{d.weight}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${d.weight}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 형식 / 선수지식 / 언어 */}
      <div className="space-y-2 border-t border-border pt-4">
        <MetaRow label="형식" value={info.format} />
        <MetaRow label="선수지식" value={info.prerequisites} />
        <MetaRow label="언어" value={info.languages.join(', ')} />
      </div>

      {/* 외부 링크 버튼: 모바일 풀폭, sm+ 인라인 */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href={info.officialUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 sm:w-auto"
        >
          공식 시험 안내 <ExternalLink className="h-4 w-4" />
        </a>
        <a
          href={info.registerUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-bg-subtle px-4 py-2 text-sm font-medium text-fg transition hover:border-border-strong sm:w-auto"
        >
          시험 등록 <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}
