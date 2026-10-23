import { createHash } from 'node:crypto';

// tutor_explanations 캐시 키(question_id 칼럼에 들어갈 값).
//
// 캐시는 (문제, 고른 보기 라벨)로 첫 설명을 재사용한다. 모의고사 은행(content/exams)은 보기 문구를
// 다듬거나 보기 순서를 섞어 라벨을 다시 붙이는 일이 있다(P4 Step 3). 그러면 같은 id·같은 라벨이라도
// 가리키는 보기 내용이 달라져, 예전 설명이 엉뚱한 보기를 해설하게 된다.
// 그래서 모의고사 문제는 문제·보기·정답의 지문(fingerprint)을 키에 붙인다. 내용이 바뀌면 키가 달라져
// 예전 캐시는 조회되지 않고(삭제 불필요) 새 설명이 한 번 생성된다.
// day 퀴즈는 원문 보존 계약(quizContract)으로 고정돼 있어 기존 키를 그대로 쓴다(기존 캐시 유지).
const EXAM_ID_PREFIX = 'exam-';
const FINGERPRINT_LENGTH = 12;

export interface CacheKeySource {
  prompt: string;
  choices: { label: string; text: string }[];
  answer: string;
}

export function tutorCacheKey(questionId: string, question: CacheKeySource): string {
  if (!questionId.startsWith(EXAM_ID_PREFIX)) return questionId;
  const content = JSON.stringify([question.prompt, question.choices.map((c) => [c.label, c.text]), question.answer]);
  const fingerprint = createHash('sha256').update(content).digest('hex').slice(0, FINGERPRINT_LENGTH);
  return `${questionId}#${fingerprint}`;
}
