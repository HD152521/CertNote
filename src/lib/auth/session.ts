import { SignJWT, jwtVerify } from 'jose';
import { AppError } from './errors';
import type { Role } from './types';

export const SESSION_COOKIE = 'cn_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7일

export interface SessionPayload {
  sub: string; // user id
  email: string;
  role: Role;
  ver: number; // token_version — 비번 변경/재설정 시 DB값과 불일치하면 세션 무효(서버 컴포넌트/라우트에서 판정)
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new AppError(500, 'config_error', 'JWT_SECRET이 설정되지 않았거나 너무 짧습니다.');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role, ver: payload.ver })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
}

// 검증 실패(만료·위조·설정누락)는 모두 null로 수렴 — 호출부에서 비로그인으로 처리.
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const role = payload.role === 'admin' ? 'admin' : 'user';
    // ver 누락(구 토큰)은 0으로 취급 → token_version DEFAULT 0과 일치해 기존 세션이 무효화되지 않는다.
    const ver = typeof payload.ver === 'number' ? payload.ver : 0;
    return { sub: String(payload.sub ?? ''), email: String(payload.email ?? ''), role, ver };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE_SECONDS,
};
