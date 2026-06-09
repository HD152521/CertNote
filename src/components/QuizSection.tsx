import { Quiz } from './Quiz';
import type { QuizQuestion } from '@/lib/parseQuiz';
import { questionId } from '@/lib/questionId';

interface QuizSectionProps {
  questions: QuizQuestion[];
  slug: string;
  week: number;
  day: number;
}

export function QuizSection({ questions, slug, week, day }: QuizSectionProps) {
  if (questions.length === 0) return null;
  return (
    <section className="my-10 space-y-3">
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight">📝 연습 문제</h2>
        <p className="text-sm text-fg-muted">선택지를 클릭하면 정답·해설이 펼쳐집니다.</p>
      </header>
      <div className="space-y-3">
        {questions.map((q, i) => (
          <Quiz key={i} question={q} questionId={questionId(slug, week, day, i + 1)} />
        ))}
      </div>
    </section>
  );
}
