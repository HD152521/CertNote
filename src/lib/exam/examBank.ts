import examData from '@/data/exam-questions.json';

// 모의고사 전용 문제 은행. day 퀴즈(questions.ts)와 완전히 분리된 별도 인덱스.
// 공식 Exam Guide 도메인 기반 오리지널 시험형 문제. id는 'exam-<slug>-<번호>'.
export interface ExamBankQuestion {
  id: string;
  slug: string;
  domain: string;
  number: number;
  prompt: string;
  choices: { label: string; text: string }[];
  answer: string;
  explanation: string;
}

const questions = examData as ExamBankQuestion[];
const byId = new Map<string, ExamBankQuestion>(questions.map((q) => [q.id, q]));

export function getAllExamQuestions(): ExamBankQuestion[] {
  return questions;
}

export function getExamQuestionById(id: string): ExamBankQuestion | undefined {
  return byId.get(id);
}

export function getExamQuestionsByCert(slug: string): ExamBankQuestion[] {
  return questions.filter((q) => q.slug === slug);
}

// 특정 시험 도메인의 문제(약점 도메인 드릴용).
export function getExamQuestionsByDomain(domain: string): ExamBankQuestion[] {
  return questions.filter((q) => q.domain === domain);
}

// 모의고사 문제를 보유한 자격증 slug 목록(셋업 화면의 범위 선택용).
export function getExamCertSlugs(): string[] {
  return [...new Set(questions.map((q) => q.slug))];
}
