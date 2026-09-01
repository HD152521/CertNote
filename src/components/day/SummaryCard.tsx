import { MDXRemote } from 'next-mdx-remote/rsc';
import { ListChecks } from 'lucide-react';
import type { Lang } from '@/lib/category';
import { mdxOptions } from '@/lib/mdx';

interface SummaryCardProps {
  /** daySummary.ts가 추출한 "## 핵심 정리" 섹션의 마크다운(헤딩 제외). null이 아닐 때만 렌더된다. */
  summary: string;
  lang: Lang;
}

// day 본문 맨 위에 오는 "핵심 정리" 카드. 나머지 본문과 시각적으로 구분되도록 테두리+배경으로
// 감싼다(디자인 요구사항: "핵심 정리 노트" 느낌). summary가 null인 문서(아직 미변환)에서는
// DayView가 이 컴포넌트를 아예 렌더하지 않는다 — 그게 이 카드의 유일한 안전장치다.
export function SummaryCard({ summary, lang }: SummaryCardProps) {
  return (
    <div className="mb-8 rounded-xl border border-accent/30 bg-bg-subtle px-5 py-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-accent">
        <ListChecks className="h-4 w-4" aria-hidden="true" />
        <span>{lang === 'en' ? 'Key Takeaways' : '핵심 정리'}</span>
      </div>
      <div className="article article--summary">
        <MDXRemote source={summary} options={mdxOptions} />
      </div>
    </div>
  );
}
