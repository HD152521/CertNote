// 자격증 허브 '트랙 구성' 문구.
//
// 원칙: 자격증마다 값이 달라지는 사실만 넣는다. 11개 허브가 같은 텍스트를 공유할수록
// 페이지 간 유사도가 올라가 색인에 불리하다(AWS_EXAM_TIPS가 이미 전 자격증 공통이다).
// 그리고 수치가 없는 항목은 줄 자체를 빼서 '없는 걸 있다고' 쓰지 않는다.
export interface TrackContentsInput {
  dayCount: number;
  weeks: number;
  mockExamCount: number; // content/exams/<slug>.json 문항 수. 0이면 모의고사 줄 생략.
}

export function buildTrackContents({ dayCount, weeks, mockExamCount }: TrackContentsInput): string[] {
  return [
    `심화 노트 ${dayCount}일 — ${weeks}주 커리큘럼, Week 1은 무료로 공개`,
    ...(mockExamCount > 0
      ? [`모의고사 ${mockExamCount}문항 — 공식 시험 가이드 도메인 기반 오리지널 문항`]
      : []),
    '일일 연습문제 — 학습일마다 이해도 점검 퀴즈',
    '오답 복습 — 틀린 문항을 SM-2 간격 반복으로 재출제',
  ];
}
