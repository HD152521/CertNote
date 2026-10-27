import { CalendarClock, ExternalLink } from 'lucide-react';
import type { ExamUpcoming } from '@/lib/examInfo';
import BulletList from '@/components/ui/BulletList';
import { formatKoDate } from '@/components/ExamRevisionSection';
import { withTo } from '@/lib/koParticle';

interface UpcomingExamNoticeProps {
  code: string; // 현재 트랙 기준 버전(예: 'SAP-C02')
  upcoming: ExamUpcoming;
}

// 발표된 다음 시험 버전 안내(자격증 허브 상단, 한국어 화면 전용). 노트가 어느 버전 기준인지
// 먼저 밝힌다 — 응시 날짜에 따라 공부할 범위가 달라지므로 시작 전에 알아야 하는 정보다.
export default function UpcomingExamNotice({ code, upcoming }: UpcomingExamNoticeProps) {
  return (
    <section aria-labelledby="exam-upcoming-heading" className="space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-4 sm:p-5">
      <h2 id="exam-upcoming-heading" className="flex items-center gap-2 text-base font-semibold text-fg">
        <CalendarClock className="h-4 w-4 shrink-0 text-accent" />
        {upcoming.code} 개정 안내
      </h2>
      <p className="text-sm leading-relaxed text-fg-muted">
        {formatKoDate(upcoming.since)}부터 시험이 <strong className="text-fg">{withTo(upcoming.code)}</strong> 바뀝니다. 그 전날까지는{' '}
        {withTo(code)} 응시합니다. CertNote의 노트와 문제는 현재 <strong className="text-fg">{code}</strong> 기준입니다.
      </p>
      <BulletList items={upcoming.changes} />
      <p className="text-xs leading-relaxed text-fg-faint">
        출처:{' '}
        {upcoming.sources.map((url, i) => (
          <span key={url}>
            {i > 0 && ', '}
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-fg">
              AWS 공식 문서{upcoming.sources.length > 1 ? ` ${i + 1}` : ''} <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        ))}{' '}
        · {formatKoDate(upcoming.checkedAt)} 확인
      </p>
    </section>
  );
}
