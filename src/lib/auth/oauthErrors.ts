// 구글 로그인 시작(api/auth/google)·콜백(api/auth/google/callback)이 실패하면
// /login?error=<code> 로 돌려보낸다. 여기 없는 코드는 아무 문구도 보여주지 않는다.
const OAUTH_ERRORS: Record<string, { ko: string; en: string }> = {
  google: { ko: '구글 로그인에 실패했습니다. 다시 시도해 주세요.', en: 'Google login failed. Please try again.' },
  google_disabled: {
    ko: '지금은 구글 로그인을 쓸 수 없습니다. 이메일로 로그인해 주세요.',
    en: 'Google login is unavailable right now. Please use email.',
  },
  rate_limited: { ko: '요청이 많습니다. 1분 뒤에 다시 시도해 주세요.', en: 'Too many attempts. Please try again in a minute.' },
};

export function oauthErrorMessage(code: string | null, en: boolean): string | null {
  if (!code || !Object.hasOwn(OAUTH_ERRORS, code)) return null;
  const msg = OAUTH_ERRORS[code];
  return en ? msg.en : msg.ko;
}
