import { Quiz } from './Quiz';
import type { QuizQuestion } from '@/lib/parseQuiz';

interface QuizSectionProps { questions: QuizQuestion[]; }

export function QuizSection({ questions }: QuizSectionProps) {
  if (questions.length === 0) return null;
  return (
    <section className="my-10 space-y-3">
      <header className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight">📝 연습 문제</h2>
        <p className="text-sm text-fg-muted">선택지를 클릭하면 정답·해설이 펼쳐집니다.</p>
      </header>
      <div className="space-y-3">
        {questions.map((q) => (<Quiz key={q.number} question={q} />))}
      </div>
    </section>
  );
}
