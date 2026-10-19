// 플로팅 피드백 버튼(FeedbackWidget)을 숨길 화면.
//
// 모의고사(/exam)·복습 세션(/review)은 한 문제씩 "이전 / 다음 → / 제출" 버튼을 빠르게 누르는 화면이다.
// 이 버튼들은 오른쪽 아래에 오는데, 모바일(390px)에서는 문항이 짧으면 첫 화면에서, 길면 스크롤 중에
// 고정된 피드백 버튼(bottom-4 right-4) 바로 밑에 놓여 "다음"을 누르면 피드백이 열렸다.
// 풀이 흐름을 끊는 일이 없게 이 두 화면에서는 버튼을 그리지 않는다(피드백은 다른 화면 어디서나 가능).
// 경로로만 판정한다 — FeedbackWidget 은 정적 캐시되는 AppShell 에서 렌더되므로 서버 동적 API 를 쓸 수 없다.
const SESSION_PATHS = ['/exam', '/review'] as const;

export function hidesFeedbackButton(pathname: string | null): boolean {
  if (!pathname) return false;
  return SESSION_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
