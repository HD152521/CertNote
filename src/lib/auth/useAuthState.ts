'use client';

import { useEffect, useSyncExternalStore } from 'react';

export type AuthState = 'unknown' | 'anonymous' | 'authenticated';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  plan: 'free' | 'pro';
}

// 헤더(AuthNav)와 가입 권유 카드가 같은 /api/auth/me 결과를 쓰는 작은 클라이언트 저장소.
// 요청은 진행 중인 것을 공유하고(inflight), 결과는 다음 조회가 올 때까지 보관한다 — 페이지 이동마다 AuthNav 가
// loadAuthUser() 로 갱신하므로 카드는 별도 요청 없이 그 결과를 읽는다.
let state: AuthState = 'unknown';
let inflight: Promise<AuthUser | null> | null = null;
let cachedUser: AuthUser | null = null;
const listeners = new Set<() => void>();

function publish(next: AuthState): void {
  if (next === state) return;
  state = next;
  for (const cb of listeners) cb();
}

/**
 * /api/auth/me 를 묻는다. 동시 호출은 합치고, 이미 받아 둔 값이 있으면 `force` 가 아닌 한 그것을 돌려준다
 * (카드가 헤더보다 늦게 마운트돼도 요청이 두 번 나가지 않는다). 조회 실패 시 null 을 돌려주되 저장소는 'unknown' 으로 둔다.
 */
export function loadAuthUser(force: boolean = false): Promise<AuthUser | null> {
  if (inflight) return inflight;
  if (!force && state !== 'unknown') return Promise.resolve(cachedUser);
  inflight = fetch('/api/auth/me', { cache: 'no-store' })
    .then((res) => res.json())
    .then((data): AuthUser | null => {
      const user: AuthUser | null = data?.user ?? null;
      cachedUser = user;
      publish(user ? 'authenticated' : 'anonymous');
      return user;
    })
    .catch((): AuthUser | null => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** 테스트용: 저장소를 처음 상태로. */
export function resetAuthStore(): void {
  state = 'unknown';
  inflight = null;
  cachedUser = null;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * 로그인 상태. 정적 페이지는 모르므로 저장소 값을 읽는다(서버·첫 렌더는 'unknown').
 * `enabled` 가 true 이고 아직 값이 없을 때만 직접 조회한다 — 평소엔 AuthNav 의 조회 결과를 그대로 받으므로 추가 요청이 없다.
 */
export function useAuthState(enabled: boolean = true): AuthState {
  const current = useSyncExternalStore(subscribe, () => state, () => 'unknown' as AuthState);
  useEffect(() => {
    if (enabled && current === 'unknown') void loadAuthUser();
  }, [enabled, current]);
  return current;
}
