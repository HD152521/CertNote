import { Star, CheckCircle2 } from 'lucide-react';
import type { Review } from '@/lib/reviews/types';
import type { Language } from '@/lib/i18n-client';

interface ReviewListProps {
  reviews: Review[];
  lang: Language;
  /** cert 코드 라벨 표시 여부(섹션 허브처럼 여러 자격증이 섞일 때 true). */
  showCert?: boolean;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={n <= rating ? 'h-3.5 w-3.5 fill-accent text-accent' : 'h-3.5 w-3.5 text-border-strong'}
        />
      ))}
    </span>
  );
}

// 후기 목록(프레젠테이션). 데이터는 서버에서 주입, 순수 렌더.
export default function ReviewList({ reviews, lang, showCert = false }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-bg-subtle/40 px-4 py-8 text-center text-sm text-fg-muted">
        {lang === 'en' ? 'No reviews yet. Be the first to share your experience!' : '아직 후기가 없어요. 첫 합격 후기를 남겨보세요!'}
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <li key={r.id} className="space-y-2 rounded-lg border border-border bg-bg-elevated p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Stars rating={r.rating} />
            {r.passed === true && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                <CheckCircle2 className="h-3 w-3" /> {lang === 'en' ? 'Passed' : '합격'}
              </span>
            )}
            {showCert && <span className="font-mono text-[11px] uppercase text-fg-faint">{r.certSlug}</span>}
            <span className="ml-auto text-xs text-fg-faint">{r.createdAt}</span>
          </div>
          {r.title && <p className="text-sm font-semibold text-fg">{r.title}</p>}
          <p className="whitespace-pre-line text-sm leading-relaxed text-fg-muted">{r.body}</p>
          <p className="text-xs text-fg-faint">— {r.authorName}</p>
        </li>
      ))}
    </ul>
  );
}
