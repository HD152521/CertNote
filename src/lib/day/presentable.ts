import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EN_CATEGORY, contentDirOf } from '@/lib/category';

// "이 영어 day 를 사용자에게 보여줄 만한가"의 단일 출처.
//
// 규칙: 영어판 자격증 하나의 "깨끗한 접두"가 곧 한도다 — 1주차부터 N주차까지 모든 day 파일에 한글(U+AC00–U+D7A3)이
// 한 글자도 없으면 한도는 N. 손으로 관리하는 표가 아니라 파일에서 직접 도출하므로 표와 파일이 어긋날 수 없다.
// (번역 때문에 한국어가 섞인 채 lang="en" 으로 나가는 페이지가 구글에서 색인 제외되던 원인을 막는 장치.)
// 색인(isIndexableDay)·사이트맵·hreflang·JSON-LD·검색·내비게이션·직접 접근 리다이렉트가 전부 이 값을 쓴다.
//
// 파일 시스템을 동기로 읽는다: isIndexableDay 가 동기 함수이고 여러 곳에서 루프 안에 호출되기 때문이다.
// 첫 한글을 만난 파일에서 즉시 멈추므로 비용은 (깨끗한 day 수 + 1)개 파일 읽기이고, 결과는 프로세스 단위로
// 메모이즈한다(콘텐츠는 배포로만 바뀐다 — content.ts 의 프로덕션 캐시와 같은 전제). dev 에서 영어 파일을 고치면
// 서버를 재시작해야 반영된다.
const HANGUL = /[가-힣]/;
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const DAY_FILE = /^day\d+\.md$/;

export function containsHangul(text: string): boolean {
  return HANGUL.test(text);
}

const limitCache = new Map<string, number>();

function certRoot(slug: string): string {
  return path.join(process.cwd(), 'content', contentDirOf(EN_CATEGORY), slug);
}

function weekIsClean(weekDir: string): boolean {
  let files: string[];
  try {
    files = readdirSync(weekDir).filter((f) => DAY_FILE.test(f));
  } catch {
    return false;
  }
  if (files.length === 0) return false;
  return files.every((f) => !containsHangul(readFileSync(path.join(weekDir, f), 'utf8')));
}

function scanLimit(slug: string): number {
  const root = certRoot(slug);
  let week = 0;
  // 1주차부터 연속으로 깨끗한 주차만 센다(중간에 한 주라도 더러우면 그 뒤는 보여주지 않는다).
  while (weekIsClean(path.join(root, `week${week + 1}`))) week += 1;
  return week;
}

// 영어판 자격증 slug 의 "보여줄 수 있는 마지막 주차". 0 이면 어떤 day 도 보여주지 않는다.
export function enPresentableWeek(slug: string): number {
  if (!SLUG_PATTERN.test(slug)) return 0;
  const cached = limitCache.get(slug);
  if (cached !== undefined) return cached;
  const limit = scanLimit(slug);
  limitCache.set(slug, limit);
  return limit;
}

export function isEnPresentableDay(slug: string, week: number): boolean {
  return Number.isInteger(week) && week >= 1 && week <= enPresentableWeek(slug);
}

// 어느 category 든 쓰는 형태. 한국어(섹션)는 전부 보여주고, 영어판만 위 한도를 적용한다.
export function isPresentableDay(category: string, slug: string, week: number): boolean {
  return category !== EN_CATEGORY || isEnPresentableDay(slug, week);
}

// 테스트에서 파일을 바꾼 뒤 다시 도출하게 하는 용도.
export function resetPresentableCache(): void {
  limitCache.clear();
}
