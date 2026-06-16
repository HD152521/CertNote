import { getAllQuestions, getQuestionById, getQuestionsByCert, type IndexedQuestion } from '../questions';
import { isMultiAnswer, isSelectionCorrect, normalizeSelection } from '../quiz/correctness';
import { getAttemptService } from '../quiz/attemptService';

// AWS 시험 합격선은 1000점 만점 720점(≈72%). 모의고사도 동일 기준으로 합/불 판정.
export const PASS_MARK = 72;
export const MAX_COUNT = 100;

// 시험 중 클라이언트로 내려가는 문제(정답·해설 제외 — 치팅 방지).
export interface ExamQuestion {
  questionId: string;
  number: number;
  prompt: string;
  choices: { label: string; text: string }[];
  slug: string;
  week: number;
  day: number;
  multi: boolean; // 복수 정답 여부(정답 자체는 노출하지 않고 "여러 개 선택" 안내용으로만 사용).
}

export interface ExamResultItem extends ExamQuestion {
  selected: string | null;
  correct: boolean;
  answer: string;
  explanation: string;
}

export interface ExamResult {
  total: number;
  answered: number;
  correct: number;
  score: number; // 0~100
  passed: boolean;
  passMark: number;
  items: ExamResultItem[];
}

function toExamQuestion(q: IndexedQuestion): ExamQuestion {
  return { questionId: q.id, number: q.number, prompt: q.prompt, choices: q.choices, slug: q.slug, week: q.week, day: q.day, multi: isMultiAnswer(q.answer) };
}

// Fisher–Yates 셔플(원본 불변 — 복사본을 섞는다).
function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 자격증(없으면 전체)에서 무작위 count문항을 뽑아 정답 없이 반환.
export function buildExam(certSlug: string | null, count: number): ExamQuestion[] {
  const pool = certSlug ? getQuestionsByCert(certSlug) : getAllQuestions();
  const n = Math.min(Math.max(1, Math.floor(count) || 1), Math.min(MAX_COUNT, pool.length));
  return shuffle(pool).slice(0, n).map(toExamQuestion);
}

// 제출 채점: 미응답은 오답 처리, 응답분은 attempt로 기록(오답 자동 복습 적재 + 대시보드 반영).
// 채점 자체는 기록 성공 여부와 무관하게 진행한다.
export async function gradeExam(
  userId: string,
  questionIds: string[],
  answers: Record<string, string>,
): Promise<ExamResult> {
  const items: ExamResultItem[] = [];
  let correct = 0;
  let answered = 0;
  for (const id of questionIds) {
    const q = getQuestionById(id);
    if (!q) continue;
    const raw = answers[id];
    const selected = raw ? normalizeSelection(raw) : null;
    const isCorrect = selected ? isSelectionCorrect(q.answer, selected) : false;
    if (selected) answered += 1;
    if (isCorrect) correct += 1;
    items.push({ ...toExamQuestion(q), selected, correct: isCorrect, answer: q.answer, explanation: q.explanation });
    if (selected) {
      try {
        await getAttemptService().record(userId, id, selected);
      } catch {
        // 기록 실패는 채점을 막지 않는다.
      }
    }
  }
  const total = items.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { total, answered, correct, score, passed: score >= PASS_MARK, passMark: PASS_MARK, items };
}
