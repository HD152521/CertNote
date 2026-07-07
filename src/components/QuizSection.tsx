import { Quiz } from './Quiz';
import type { QuizQuestion } from '@/lib/parseQuiz';
import { questionId } from '@/lib/questionId';

interface QuizSectionProps {
  questions: QuizQuestion[];
  slug: string;
  week: number;
  day: number;
  lang?: 'ko' | 'en';
}

// 영어판 페이지도 slug 그대로 id를 만든다 — 영어 문항은 한국어 문항의 번역이라
// 같은 id를 재사용해야 풀이 기록·SRS가 언어와 무관하게 하나로 쌓인다.
export function QuizSection({ questions, slug, week, day, lang = 'ko' }: QuizSectionProps) {
  if (questions.length === 0) return null;
  return (
    <section className="my-10 space-y-3">
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight">{lang === 'en' ? '📝 Practice Questions' : '📝 연습 문제'}</h2>
        <p className="text-sm text-fg-muted">
          {lang === 'en' ? 'Click a choice to reveal the answer and explanation.' : '선택지를 클릭하면 정답·해설이 펼쳐집니다.'}
        </p>
      </header>
      <div className="space-y-3">
        {questions.map((q, i) => (
          <Quiz key={i} question={q} questionId={questionId(slug, week, day, i + 1)} lang={lang} />
        ))}
      </div>
    </section>
  );
}
