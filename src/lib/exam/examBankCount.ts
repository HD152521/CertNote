import { readFileSync } from 'node:fs';
import path from 'node:path';

// 자격증별 모의고사 문항 수(자격증 허브의 '트랙 구성' 표기용).
//
// src/data/exam-questions.json(1.3MB 전량 인덱스, examBank.ts)을 쓰지 않는 이유:
// 자격증 허브는 generateStaticParams로 전량 정적 생성되는 라우트라, 개수 하나 때문에
// 전 자격증 문제 본문·해설을 그 라우트 번들로 끌어들이게 된다. 원본 content/exams/<slug>.json
// 의 배열 길이만 읽으면 같은 값을 얻는다 — scripts/build-exam-index.mjs 가 이 배열을 그대로
// 펼쳐 인덱스를 만들기 때문에 두 값은 항상 일치한다(불일치 시 examBankCount.test.ts가 잡는다).
//
// 로딩·메모이즈·slug 화이트리스트 검증은 examInfo.ts 와 동일한 패턴을 따른다.
const EXAM_BANK_ROOT = path.join(process.cwd(), 'content', 'exams');

const EXAM_BANK_CACHE = process.env.NODE_ENV === 'production';
const cache = new Map<string, number>();

// 서버 전용. 해당 자격증의 모의고사 문항 수를 반환한다.
// 파일이 없거나 JSON이 깨졌거나 배열이 아니면 0 (호출 측에서 '없음'으로 처리).
export function getMockExamQuestionCount(slug: string): number {
  if (!/^[a-z0-9-]+$/.test(slug)) return 0;
  if (EXAM_BANK_CACHE && cache.has(slug)) return cache.get(slug) ?? 0;

  let count = 0;
  try {
    const raw = readFileSync(path.join(EXAM_BANK_ROOT, `${slug}.json`), 'utf8');
    const json: unknown = JSON.parse(raw);
    count = Array.isArray(json) ? json.length : 0;
  } catch {
    count = 0;
  }

  if (EXAM_BANK_CACHE) cache.set(slug, count);
  return count;
}
