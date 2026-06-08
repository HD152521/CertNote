'use client';

// 로그인/로그아웃 시 헤더 등 클라이언트 UI가 인증 상태를 다시 읽도록 알린다.
// (progress.ts의 CustomEvent 패턴과 동일)
const AUTH_CHANGE_EVENT = 'cn:auth-change';

export function emitAuthChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
}

export function onAuthChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(AUTH_CHANGE_EVENT, handler);
  return () => window.removeEventListener(AUTH_CHANGE_EVENT, handler);
}
