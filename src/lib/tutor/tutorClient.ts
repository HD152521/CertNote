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

// API error 코드 → 사전 키. 코드에 없는 값은 서버 message, 그것도 없으면 기본 문구로 폴백한다.
const ERR_KEY = {
  rate_limited: 'tutorRateLimited',
  tutor_unavailable: 'tutorUnavailable',
  question_not_found: 'tutorQuestionNotFound',
  global_limit: 'tutorGlobalLimit',
  tutor_failed: 'tutorStreamFailed',
  invalid_selected: 'tutorInvalidSelected',
} as const;

export type TutorErrorStrings = Record<(typeof ERR_KEY)[keyof typeof ERR_KEY] | 'tutorLoadFailed', string>;

// 'error' 종류 실패를 사용자에게 보일 문구로 바꾼다. 일반 패널과 인증 안내(재시도 거절) 양쪽이 같은 규칙을 쓴다.
export function tutorFailureMessage(
  failure: Extract<TutorFailure, { kind: 'error' }>,
  s: TutorErrorStrings,
): string {
  const key = failure.code ? ERR_KEY[failure.code as keyof typeof ERR_KEY] : undefined;
  return (key && s[key]) || failure.message || s.tutorLoadFailed;
}
