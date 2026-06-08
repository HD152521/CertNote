import questionsData from '@/data/questions.json';

// 빌드 시 scripts/build-questions-index.mjs 가 생성하는 전체 문제 인덱스.
// 3MB 규모이므로 서버(컴포넌트/라우트)에서만 사용하고, 클라이언트에는 API로 필요한 만큼만 전달한다.
export interface IndexedQuestion {
  id: string;
  category: string;
  slug: string;
  week: number;
  day: number;
  number: number;
  prompt: string;
  choices: { label: string; text: string }[];
  answer: string;
  explanation: string;
}

const questions = questionsData as IndexedQuestion[];
const byId = new Map<string, IndexedQuestion>(questions.map((q) => [q.id, q]));

export function getAllQuestions(): IndexedQuestion[] {
  return questions;
}

export function getQuestionById(id: string): IndexedQuestion | undefined {
  return byId.get(id);
}

export function getQuestionsByDay(slug: string, week: number, day: number): IndexedQuestion[] {
  return questions.filter((q) => q.slug === slug && q.week === week && q.day === day);
}

export function getQuestionsByCert(slug: string): IndexedQuestion[] {
  return questions.filter((q) => q.slug === slug);
}
