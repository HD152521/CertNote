import { getAllExamQuestions, getExamQuestionById, getExamQuestionsByCert, type ExamBankQuestion } from './examBank';
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
  domain: string; // 시험 도메인(예: "보안 설계"). day 위치(week/day)는 없음.
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

function toExamQuestion(q: ExamBankQuestion): ExamQuestion {
  return { questionId: q.id, number: q.number, prompt: q.prompt, choices: q.choices, slug: q.slug, domain: q.domain, multi: isMultiAnswer(q.answer) };
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

// 도메인 비례 샘플링: 각 도메인을 은행 내 비중대로 뽑아 실제 시험 유형 분포를 재현한다.
// (문제은행이 자격증별 공식 도메인 비중으로 작성돼 있어, 비례 추출이 곧 시험 블루프린트 근사.)
function sampleByDomain(pool: readonly ExamBankQuestion[], n: number): ExamBankQuestion[] {
  if (n >= pool.length) return shuffle(pool);

  const byDomain = new Map<string, ExamBankQuestion[]>();
  for (const q of pool) {
    const key = q.domain || '기타';
    const list = byDomain.get(key);
    if (list) list.push(q);
    else byDomain.set(key, [q]);
  }

  // 1차: 도메인별 정수 쿼터(floor). 남은 문제는 보충 후보로 모은다.
  const picked: ExamBankQuestion[] = [];
  const leftovers: ExamBankQuestion[] = [];
  const restByDomain = new Map<string, number>();
  for (const [domain, qs] of byDomain) {
    const shuffled = shuffle(qs);
    const exact = (n * qs.length) / pool.length;
    const quota = Math.min(qs.length, Math.floor(exact));
    picked.push(...shuffled.slice(0, quota));
    leftovers.push(...shuffled.slice(quota));
    restByDomain.set(domain, exact - Math.floor(exact));
  }

  // 2차: 반올림 손실분을 소수부 큰 도메인 우선으로 보충.
  const need = n - picked.length;
  if (need > 0) {
    leftovers.sort((a, b) => (restByDomain.get(b.domain || '기타') ?? 0) - (restByDomain.get(a.domain || '기타') ?? 0));
    picked.push(...leftovers.slice(0, need));
  }

  // 도메인이 뭉치지 않게 최종 셔플.
  return shuffle(picked);
}

// 모의고사 은행(day 퀴즈와 별개)에서 자격증(없으면 전체) count문항을 도메인 비례로 정답 없이 반환.
export function buildExam(certSlug: string | null, count: number): ExamQuestion[] {
  const pool = certSlug ? getExamQuestionsByCert(certSlug) : getAllExamQuestions();
  const n = Math.min(Math.max(1, Math.floor(count) || 1), Math.min(MAX_COUNT, pool.length));
  return sampleByDomain(pool, n).slice(0, n).map(toExamQuestion);
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
    const q = getExamQuestionById(id);
    if (!q) continue;
    const raw = answers[id];
    const selected = raw ? normalizeSelection(raw) : null;
    const isCorrect = selected ? isSelectionCorrect(q.answer, selected) : false;
    if (selected) answered += 1;
    if (isCorrect) correct += 1;
    items.push({ ...toExamQuestion(q), selected, correct: isCorrect, answer: q.answer, explanation: q.explanation });
    if (selected) {
      try {
        // record()는 getQuestionById(통합 lookup)로 모의고사 문제도 인식 → 오답이 복습 큐·대시보드에 연동된다.
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
