import examData from '@/data/exam-questions.json';
import examDataEn from '@/data/exam-questions-en.json';

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

export type ExamLang = 'ko' | 'en';

// 영어판. 정답은 없고(한국어 은행의 answer 를 쓴다) 문제·보기·해설·도메인 이름만 있다.
interface ExamBankQuestionEn {
  domain: string;
  prompt: string;
  choices: { label: string; text: string }[];
  explanation: string;
}

const questions = examData as ExamBankQuestion[];
const questionsEn = examDataEn as Record<string, ExamBankQuestionEn>;
const byId = new Map<string, ExamBankQuestion>(questions.map((q) => [q.id, q]));

// 화면에 보일 문제·보기·해설·도메인 이름. 영어판이 없는 문제는 한국어로 대체한다.
export function localizeExamQuestion(
  q: ExamBankQuestion,
  lang: ExamLang,
): { prompt: string; choices: { label: string; text: string }[]; explanation: string; domainLabel: string } {
  const en = lang === 'en' ? questionsEn[q.id] : undefined;
  if (en && en.choices.length === q.choices.length) {
    return { prompt: en.prompt, choices: en.choices, explanation: en.explanation, domainLabel: en.domain || q.domain };
  }
  return { prompt: q.prompt, choices: q.choices, explanation: q.explanation, domainLabel: q.domain };
}

// 도메인(한국어 키) → 영어 이름. 설정 화면의 도메인 칩을 영어로 보여 줄 때 쓴다.
export function getDomainLabelsEn(slug: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const q of questions) {
    if (q.slug !== slug) continue;
    const en = questionsEn[q.id];
    if (en?.domain && !(q.domain in map)) map[q.domain] = en.domain;
  }
  return map;
}

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
