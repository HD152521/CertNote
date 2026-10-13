// 자격증 허브 '트랙 구성' 문구.
//
// 원칙 1 — 자격증마다 값이 달라지는 사실만 넣는다. 11개 허브가 같은 텍스트를 공유할수록
// 페이지 간 유사도가 올라가 색인에 불리하다(AWS_EXAM_TIPS가 이미 전 자격증 공통이다).
// 수치가 없는 항목은 줄 자체를 빼서 '없는 걸 있다고' 쓰지 않는다.
//
// 원칙 2 — 접근 정책 정직 선언. 이 목록은 비로그인 사용자가 보는 공개 문구라, 로그인 없이
// 열리는 범위와 회원가입이 필요한 기능을 문구 안에서 구분해야 한다(buildCourseLd의
// isAccessibleForFree와 같은 태도). 구독제 보류(policy.ts PAYWALL_ENABLED=false) 기준 문구이며,
// 페이월을 되살리면 여기 문구도 함께 고쳐야 한다.
export interface TrackContentsInput {
  dayCount: number;
  weeks: number;
  mockExamCount: number; // content/exams/<slug>.json 문항 수. 0이면 모의고사 줄 생략.
}

export function buildTrackContents({ dayCount, weeks, mockExamCount }: TrackContentsInput): string[] {
  return [
    `심화 노트 ${dayCount}일 — ${weeks}주 커리큘럼, 전 주차 무료 공개`,
    // 모의고사(/exam)는 로그인이 필요하다. 바로 윗줄이 공개 범위를 밝히고 있어 여기서 침묵하면
    // 로그인 없이 되는 것으로 읽힌다.
    ...(mockExamCount > 0
      ? [`모의고사 ${mockExamCount}문항 — 공식 시험 가이드 도메인 기반 오리지널 문항(무료 회원가입 후 이용)`]
      : []),
    '일일 연습문제 — 학습일마다 이해도 점검 퀴즈',
    // 복습(/review)도 로그인이 필요하다(오답 기록이 계정에 쌓인다).
    '오답 복습 — 틀린 문항을 SM-2 간격 반복으로 재출제(무료 회원가입 후 이용)',
  ];
}
