import Link from 'next/link';
import type { Lang } from '@/lib/category';
import type { CertMeta } from '@/lib/content';
import { fmt, pick } from '@/lib/strings/dict';
import { trustStrings } from '@/lib/strings/trust';

export interface DaySourceLineProps {
  certMeta: Pick<CertMeta, 'code' | 'section'>;
  lang: Lang;
  /** 마지막 검수 월(YYYY-MM). 검수 기록이 없으면 null 이고, 그때는 날짜를 표시하지 않는다. */
  reviewedMonth: string | null;
  /** 이 노트의 공개 경로(/aws/saa-c03/week1/day1). 오류 제보 링크에 실어 어느 노트인지 알린다. */
  pagePath: string;
}

// 오류 제보 링크. 문의 페이지는 정적이라 쿼리를 읽지 않지만, 제보자가 주소창의 경로를 그대로
// 복사해 보낼 수 있고 접속 기록에서도 어느 노트에서 왔는지 보인다. 정적 링크라 캐시 계약에 영향이 없다.
export function reportErrorHref(pagePath: string): string {
  return `/contact?page=${encodeURIComponent(pagePath)}`;
}

// day 본문 상단의 출처·검수 메타 줄(docs/P4-trust-quality-plan.md Step 5a).
// 순수 서버 컴포넌트 — props 만 읽는다(요청별 동적 API 금지, DayView 의 계약과 같다).
export function DaySourceLine({ certMeta, lang, reviewedMonth, pagePath }: DaySourceLineProps) {
  const s = pick(trustStrings, lang);
  const basis = fmt(certMeta.section === 'linux' ? s.basisLinux : s.basisAws, { exam: certMeta.code });
  return (
    <p aria-label={s.lineLabel} className="mb-2 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted">
      <span>{basis}</span>
      {reviewedMonth && (
        <>
          <span aria-hidden className="text-fg-faint">·</span>
          <span>{fmt(s.lastReviewed, { month: reviewedMonth })}</span>
        </>
      )}
      <span aria-hidden className="text-fg-faint">·</span>
      <Link href={reportErrorHref(pagePath)} className="underline underline-offset-4 hover:text-fg">
        {s.reportError}
      </Link>
    </p>
  );
}
