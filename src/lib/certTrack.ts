import { FREE_WEEK } from './entitlement/policy';

// 자격증 허브 '트랙 구성' 문구.
//
// 원칙 1 — 자격증마다 값이 달라지는 사실만 넣는다. 11개 허브가 같은 텍스트를 공유할수록
// 페이지 간 유사도가 올라가 색인에 불리하다(AWS_EXAM_TIPS가 이미 전 자격증 공통이다).
// 수치가 없는 항목은 줄 자체를 빼서 '없는 걸 있다고' 쓰지 않는다.
//
// 원칙 2 — 페이월 정직 선언. 이 목록은 비로그인 사용자가 보는 공개 문구라, 무료로 열리는
// 범위와 Pro 전용을 문구 안에서 구분해야 한다(buildCourseLd의 isAccessibleForFree와 같은 태도).
// 무료 주차는 FREE_WEEK에서 파생시킨다 — policy.ts가 "마케팅 실험 시 이 상수 하나만 바꾼다"고
// 선언한 값이라, 여기에 숫자를 박아두면 상수가 바뀌는 순간 문구만 조용히 거짓이 된다.
export interface TrackContentsInput {
  dayCount: number;
  weeks: number;
  mockExamCount: number; // content/exams/<slug>.json 문항 수. 0이면 모의고사 줄 생략.
}

export function buildTrackContents({ dayCount, weeks, mockExamCount }: TrackContentsInput): string[] {
  return [
    `심화 노트 ${dayCount}일 — ${weeks}주 커리큘럼, ${FREE_WEEK}주차까지 무료`,
    // 모의고사는 canTakeExam()이 plan==='pro'만 허용한다. 바로 윗줄이 무료 범위를 밝히고 있어
    // 여기서 침묵하면 무료로 읽힌다.
    ...(mockExamCount > 0
      ? [`모의고사 ${mockExamCount}문항 — 공식 시험 가이드 도메인 기반 오리지널 문항(Pro 전용)`]
      : []),
    '일일 연습문제 — 학습일마다 이해도 점검 퀴즈',
    // 복습(/review)은 로그인만 요구하고 plan 게이팅이 없다 — Pro 표기를 붙이지 않는다.
    '오답 복습 — 틀린 문항을 SM-2 간격 반복으로 재출제',
  ];
}
