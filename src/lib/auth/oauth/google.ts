import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from '../errors';

// 구글 OAuth 2.0 (Authorization Code + id_token 검증).
// NextAuth 없이 기존 자체 JWT 세션(cn_session)에 붙인다.
// 필요한 env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (미설정 시 로그인 버튼 자체가 숨겨진다).

// state/nonce/next를 담는 임시 쿠키 이름(시작 라우트가 심고 콜백이 검증 후 제거).
export const OAUTH_STATE_COOKIE = 'cn_oauth';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// JWKS는 모듈 스코프에 캐시(요청마다 원격 조회 방지 — jose가 내부 캐싱·키 회전 처리).
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export function isGoogleLoginEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new AppError(503, 'oauth_disabled', '구글 로그인이 설정되지 않았습니다.');
  return id;
}

export function googleAuthUrl(input: { redirectUri: string; state: string; nonce: string }): string {
  const u = new URL(AUTH_ENDPOINT);
  u.searchParams.set('client_id', clientId());
  u.searchParams.set('redirect_uri', input.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', input.state);
  u.searchParams.set('nonce', input.nonce);
  // 매번 계정 선택 화면 — 공용 PC에서 이전 계정으로 자동 로그인되는 사고 방지.
  u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

// code → 토큰 교환 → id_token 서명·발급자·수신자·nonce 검증 → 신원 반환.
export async function exchangeGoogleCode(input: {
  code: string;
  redirectUri: string;
  nonce: string;
}): Promise<GoogleIdentity> {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new AppError(503, 'oauth_disabled', '구글 로그인이 설정되지 않았습니다.');

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: clientId(),
      client_secret: secret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    throw new AppError(401, 'oauth_exchange_failed', '구글 인증에 실패했습니다. 다시 시도해 주세요.');
  }
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) {
    throw new AppError(401, 'oauth_no_id_token', '구글 인증 응답이 올바르지 않습니다.');
  }

  const { payload } = await jwtVerify(tokens.id_token, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId(),
  });
  // nonce 대조 — 발급 시 쿠키에 심은 값과 일치해야 재전송 공격이 아님.
  if (payload.nonce !== input.nonce) {
    throw new AppError(401, 'oauth_nonce_mismatch', '구글 인증 검증에 실패했습니다. 다시 시도해 주세요.');
  }
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new AppError(401, 'oauth_bad_claims', '구글 계정 정보를 확인할 수 없습니다.');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : null,
  };
}
