import { AppError } from './errors';
import { verifyPassword } from './passwords';
import type { AccountAuthInfo } from './account';

// 회원 탈퇴 직전의 본인 확인. 어떤 확인 수단을 요구할지는 DB의 has_password 만 보고 정한다
// (요청 본문에 "구글 계정" 같은 플래그가 와도 무시 — 비밀번호 계정이 확인을 건너뛰는 우회를 막는다).
//
// - 비밀번호 계정: 지금처럼 현재 비밀번호.
// - 비밀번호 없는(구글 전용) 계정: 최근 로그인(세션 발급 10분 이내) + 계정 이메일을 직접 입력.
//
// 근거:
//   이메일은 비밀이 아니다(마이페이지에 표시되고 세션 토큰에도 들어 있다). 그래서 이메일 입력은 오클릭·자동화된
//   요청을 막는 "명시적 의사 확인"일 뿐, 세션을 훔친 공격자를 막지 못한다. 그 몫을 "최근 로그인"이 맡는다 —
//   비밀번호 계정의 비밀번호 재확인에 해당하는 재인증으로, 오래된(훔쳐서 쓰는) 세션으로는 지울 수 없고
//   구글 로그인을 다시 거쳐 새로 발급된 세션만 통과한다. 세션 발급 시각은 JWT iat(로그인·비밀번호 변경 때만 발급)이며,
//   iat 가 없는 옛 토큰은 언제 발급됐는지 알 수 없으므로 최근 로그인으로 보지 않는다.
//   세션 쿠키는 httpOnly·SameSite=lax 라 다른 사이트의 POST 로는(CSRF) 여기까지 오지 못한다.
//   비밀번호 "설정"은 새 로그인 수단을 만드는 일이라 이것보다 더 엄격하게 메일 링크로만 허용한다.
// 구글 전용 계정 탈퇴에 요구하는 "최근 로그인" 창. 다시 로그인한 뒤 마이페이지로 돌아와 이메일을 입력할
// 시간으로 충분하면서, 자리를 비운 사이 열려 있던 세션으로는 지울 수 없을 만큼 짧게.
export const RECENT_LOGIN_WINDOW_SEC = 10 * 60;

export async function assertDeletionConfirmed(
  info: Pick<AccountAuthInfo, 'email' | 'passwordHash' | 'hasPassword'>,
  body: unknown,
  session: { iat?: number },
  nowMs: number = Date.now(),
): Promise<void> {
  const input = (body ?? {}) as { password?: unknown; confirmEmail?: unknown };

  if (info.hasPassword) {
    const password = typeof input.password === 'string' ? input.password : '';
    if (!password) {
      throw new AppError(400, 'invalid_body', '비밀번호를 입력하세요.');
    }
    if (!(await verifyPassword(password, info.passwordHash))) {
      throw new AppError(400, 'invalid_credentials', '비밀번호가 올바르지 않습니다.');
    }
    return;
  }

  const ageSec = typeof session.iat === 'number' ? nowMs / 1000 - session.iat : Number.POSITIVE_INFINITY;
  if (!(ageSec >= -60 && ageSec <= RECENT_LOGIN_WINDOW_SEC)) {
    // -60: 서버 간 시계 차이 허용. 그보다 미래의 iat 는 정상 발급이 아니므로 통과시키지 않는다.
    throw new AppError(403, 'reauth_required', '보안을 위해 다시 로그인한 뒤 탈퇴해 주세요.');
  }

  const typed = typeof input.confirmEmail === 'string' ? input.confirmEmail.trim().toLowerCase() : '';
  if (!typed) {
    throw new AppError(400, 'confirm_email_required', '확인을 위해 계정 이메일 주소를 입력하세요.');
  }
  // 세션 토큰의 email 이 아니라 DB 의 현재 이메일과 대조한다.
  if (typed !== info.email.trim().toLowerCase()) {
    throw new AppError(400, 'confirm_email_mismatch', '입력한 이메일이 계정 이메일과 다릅니다.');
  }
}
