// TutorPanel(클라이언트)이 /api/tutor 오류 응답을 어떤 화면 상태로 바꿀지 판정한다. 순수 함수라 단위 테스트가 가능하다.
export type TutorFailure =
  | { kind: 'login' } // 401 — 가입/로그인 안내
  | { kind: 'verify' } // 403 email_unverified — 인증 메일 안내 + 재발송
  | { kind: 'error'; code?: string; message?: string }; // 그 외 — 코드별 문구 또는 서버 메시지

export function classifyTutorFailure(status: number, data: { error?: string; message?: string }): TutorFailure {
  if (status === 401) return { kind: 'login' };
  if (status === 403 && data.error === 'email_unverified') return { kind: 'verify' };
  return { kind: 'error', code: data.error, message: data.message };
}
