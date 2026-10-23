import type { Dict } from './dict';

/**
 * day 페이지 상단의 출처·검수 메타 줄(docs/P4-trust-quality-plan.md Step 5a).
 *
 * `{exam}` 에는 시험 코드(SAA-C03, 리눅스마스터 1급)가, `{month}` 에는 YYYY-MM 이 들어간다.
 */
export type TrustKey = 'basisAws' | 'basisLinux' | 'lastReviewed' | 'reportError' | 'lineLabel';

export const trustStrings: Dict<TrustKey> = {
  ko: {
    basisAws: '기준: {exam} 시험 가이드',
    basisLinux: '기준: {exam} 출제 기준',
    lastReviewed: '마지막 검수 {month}',
    reportError: '오류 제보',
    lineLabel: '노트 출처와 검수 정보',
  },
  en: {
    basisAws: 'Based on the {exam} exam guide',
    basisLinux: 'Based on the {exam} exam syllabus',
    lastReviewed: 'Last reviewed {month}',
    reportError: 'Report an error',
    lineLabel: 'Note source and review information',
  },
};
