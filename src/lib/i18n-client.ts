'use client';

import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import {
  COMMON_STRINGS,
  LANG_COOKIE,
  LANG_COOKIE_MAX_AGE,
  detectLanguage,
  normalizeLanguage,
  resolveLanguage,
  t,
  type Language,
} from './i18n';

export type { Language };
export { t, COMMON_STRINGS, detectLanguage };

// 쿠키는 클라이언트가 읽어야 하므로 httpOnly가 아니다. 언어 선호값이라 민감정보가 아니고,
// 위조되더라도 normalizeLanguage가 ko/en 외 값을 전부 ko로 떨어뜨린다.
function readLangCookie(): string | undefined {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

// document.cookie는 변경 이벤트가 없다. setLanguage가 쓰기 직후 직접 알린다.
const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit(): void {
  for (const cb of listeners) cb();
}

/**
 * Persist the user's language preference and notify every `useLanguage()` subscriber.
 * Only affects pages where the cookie has authority — see `resolveLanguage`.
 */
export function setLanguage(lang: Language): void {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; samesite=lax`;
  emit();
}

/**
 * Current language for client components.
 *
 * `/en/*` and indexed Korean pages resolve from the pathname alone, so server and
 * client agree and hydration is stable. On login-gated pages the cookie decides:
 * the server snapshot renders Korean, then React swaps in the cookie value.
 */
export function useLanguage(): Language {
  const pathname = usePathname();
  return useSyncExternalStore(
    subscribe,
    () => resolveLanguage(pathname, readLangCookie()),
    () => normalizeLanguage(resolveLanguage(pathname, undefined)),
  );
}
