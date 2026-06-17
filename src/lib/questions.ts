import questionsData from '@/data/questions.json';
import { getExamQuestionById } from './exam/examBank';

// 빌드 시 scripts/build-questions-index.mjs 가 생성하는 전체 문제 인덱스.
// 3MB 규모이므로 서버(컴포넌트/라우트)에서만 사용하고, 클라이언트에는 API로 필요한 만큼만 전달한다.
export interface IndexedQuestion {
  id: string;
  category: string;
  slug: string;
  week: number; // day 문제의 주차. 모의고사 문제는 0(주차 없음).
  day: number;  // day 문제의 일차. 모의고사 문제는 0.
  number: number;
  prompt: string;
  choices: { label: string; text: string }[];
  answer: string;
  explanation: string;
  domain?: string; // 모의고사 문제의 시험 도메인(day 문제엔 없음).
}

const questions = questionsData as IndexedQuestion[];
const byId = new Map<string, IndexedQuestion>(questions.map((q) => [q.id, q]));

// day 퀴즈 전용 목록(대시보드 커버리지·일자별 조회 기준).
export function getAllQuestions(): IndexedQuestion[] {
  return questions;
}

// 문제 단건 조회. day 인덱스에 없으면 모의고사 은행에서 찾아 통일된 형태로 반환한다.
// → 모의고사 오답도 풀이 기록·복습 큐·대시보드 집계에 그대로 연동된다.
export function getQuestionById(id: string): IndexedQuestion | undefined {
  const dayQ = byId.get(id);
  if (dayQ) return dayQ;
  const examQ = getExamQuestionById(id);
  if (!examQ) return undefined;
  return {
    id: examQ.id,
    category: 'aws-certs',
    slug: examQ.slug,
    week: 0,
    day: 0,
    number: examQ.number,
    prompt: examQ.prompt,
    choices: examQ.choices,
    answer: examQ.answer,
    explanation: examQ.explanation,
    domain: examQ.domain,
  };
}

export function getQuestionsByDay(slug: string, week: number, day: number): IndexedQuestion[] {
  return questions.filter((q) => q.slug === slug && q.week === week && q.day === day);
}

export function getQuestionsByCert(slug: string): IndexedQuestion[] {
  return questions.filter((q) => q.slug === slug);
}
