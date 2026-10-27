import { createHash } from 'node:crypto';

// tutor_explanations 캐시 키(question_id 칼럼에 들어갈 값).
//
// 캐시는 (문제, 고른 보기 라벨)로 첫 설명을 재사용한다. 모의고사 은행(content/exams)은 보기 문구를
// 다듬거나 보기 순서를 섞어 라벨을 다시 붙이는 일이 있다(P4 Step 3). 그러면 같은 id·같은 라벨이라도
// 가리키는 보기 내용이 달라져, 예전 설명이 엉뚱한 보기를 해설하게 된다.
// 그래서 모의고사 문제는 문제·보기·정답의 지문(fingerprint)을 키에 붙인다. 내용이 바뀌면 키가 달라져
// 예전 캐시는 조회되지 않고(삭제 불필요) 새 설명이 한 번 생성된다.
// day 퀴즈는 기존 키를 그대로 쓴다(기존 캐시 유지). quizContract 는 문항 수·정답 글자·보기 수만
// 고정할 뿐 문구는 막지 않으므로, day 문제의 문제·보기·해설을 고치면 아래 목록에 id 를 넣어
// 키를 한 번 바꾼다(예전 캐시는 조회되지 않고 새 설명이 생성된다).
const EXAM_ID_PREFIX = 'exam-';

// 2026-10-26 PR #24: DVA·SAA 사실 정정(보기·해설), SCS '핀딩'→'결과' 표기 정리.
const DAY_REVISION_SUFFIX = '#r2';
const REVISED_DAY_QUESTIONS = new Set([
  'dva-c02-w11-d1-q5',
  'dva-c02-w3-d4-q6',
  'dva-c02-w5-d1-q5',
  'dva-c02-w5-d1-q7',
  'saa-c03-w12-d1-q2',
  'scs-c03-w10-d1-q1',
  'scs-c03-w10-d1-q5',
  'scs-c03-w8-d2-q2',
  'scs-c03-w8-d2-q3',
  'scs-c03-w8-d2-q4',
  'scs-c03-w8-d2-q5',
  'scs-c03-w8-d4-q1',
  'scs-c03-w8-d5-q3',
  'scs-c03-w8-d5-q5',
  'scs-c03-w9-d1-q3',
  'scs-c03-w9-d1-q4',
  'scs-c03-w9-d1-q5',
  'scs-c03-w9-d2-q1',
  'scs-c03-w9-d2-q3',
  'scs-c03-w9-d2-q4',
  'scs-c03-w9-d4-q1',
  'scs-c03-w9-d4-q3',
  'scs-c03-w9-d4-q4',
  'scs-c03-w9-d5-q2',
  'scs-c03-w9-d5-q4',
  'scs-c03-w9-d5-q5',
]);
const FINGERPRINT_LENGTH = 12;

export interface CacheKeySource {
  prompt: string;
  choices: { label: string; text: string }[];
  answer: string;
}

export function tutorCacheKey(questionId: string, question: CacheKeySource): string {
  if (!questionId.startsWith(EXAM_ID_PREFIX)) {
    return REVISED_DAY_QUESTIONS.has(questionId) ? `${questionId}${DAY_REVISION_SUFFIX}` : questionId;
  }
  const content = JSON.stringify([question.prompt, question.choices.map((c) => [c.label, c.text]), question.answer]);
  const fingerprint = createHash('sha256').update(content).digest('hex').slice(0, FINGERPRINT_LENGTH);
  return `${questionId}#${fingerprint}`;
}
