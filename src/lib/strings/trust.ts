import type { Dict } from './dict';

/**
 * day 페이지 상단의 출처·검수 메타 줄(docs/P4-trust-quality-plan.md Step 5a).
 *
 * `{exam}` 에는 시험 코드(SAA-C03, 리눅스마스터 1급)가, `{month}` 에는 YYYY-MM 이 들어간다.
 */
export type TrustKey =
  | 'basisAws'
  | 'basisLinux'
  | 'lastReviewed'
  | 'reportError'
  | 'lineLabel'
  | 'refsHeading'
  | 'refsExamGuide'
  | 'refsExamSyllabus'
  | 'refsDocsSuffix'
  | 'refsNewTab';

export const trustStrings: Dict<TrustKey> = {
  ko: {
    basisAws: '기준: {exam} 시험 가이드',
    basisLinux: '기준: {exam} 출제 기준',
    lastReviewed: '마지막 검수 {month}',
    reportError: '오류 제보',
    lineLabel: '노트 출처와 검수 정보',
    refsHeading: '참고 공식 자료',
    refsExamGuide: '{exam} 공식 시험 안내',
    refsExamSyllabus: '{exam} 공식 출제 기준',
    refsDocsSuffix: '공식 문서',
    refsNewTab: '(새 탭에서 열림)',
  },
  en: {
    basisAws: 'Based on the {exam} exam guide',
    basisLinux: 'Based on the {exam} exam syllabus',
    lastReviewed: 'Last reviewed {month}',
    reportError: 'Report an error',
    lineLabel: 'Note source and review information',
    refsHeading: 'Official references',
    refsExamGuide: '{exam} official exam page',
    refsExamSyllabus: '{exam} official exam syllabus',
    refsDocsSuffix: 'documentation',
    refsNewTab: '(opens in a new tab)',
  },
};
