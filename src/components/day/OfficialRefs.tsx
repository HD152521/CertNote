import { ExternalLink } from 'lucide-react';
import type { Lang } from '@/lib/category';
import type { CertMeta } from '@/lib/content';
import { awsDocsUrl, type AwsServiceDoc } from '@/lib/day/officialRefs';
import { fmt, pick } from '@/lib/strings/dict';
import { trustStrings } from '@/lib/strings/trust';

export interface OfficialRefsProps {
  certMeta: Pick<CertMeta, 'code' | 'section'>;
  lang: Lang;
  /** content/exam-info 의 공식 시험 안내 주소. 시험 정보가 없는 트랙이면 null. */
  examUrl: string | null;
  /** 노트에서 주로 다룬 AWS 서비스(detectAwsServices). 리눅스 트랙은 빈 배열. */
  services: readonly AwsServiceDoc[];
}

// day 노트 끝의 "참고 공식 자료"(공식 시험 안내 + 서비스별 AWS 공식 문서).
// 순수 서버 컴포넌트 — props 만 읽는다(DayView 의 정적 캐시 계약과 같다).
export function OfficialRefs({ certMeta, lang, examUrl, services }: OfficialRefsProps) {
  if (!examUrl && services.length === 0) return null;
  const s = pick(trustStrings, lang);
  const examLabel = fmt(certMeta.section === 'linux' ? s.refsExamSyllabus : s.refsExamGuide, { exam: certMeta.code });
  const items = [
    ...(examUrl ? [{ href: examUrl, label: examLabel }] : []),
    ...services.map((doc) => ({ href: awsDocsUrl(doc.path, lang), label: `${doc.label} ${s.refsDocsSuffix}` })),
  ];
  return (
    <section aria-labelledby="official-refs" className="mt-10 rounded-lg border border-border bg-bg-elevated px-4 py-3">
      <h2 id="official-refs" className="text-xs font-medium uppercase tracking-wider text-fg-muted">
        {s.refsHeading}
      </h2>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
            >
              {item.label}
              <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
              <span className="sr-only">{s.refsNewTab}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
