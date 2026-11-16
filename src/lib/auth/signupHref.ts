import { authHref } from './authLang';
import { safeNext } from './safeNext';
import type { Language } from '../i18n';

/**
 * 가입 링크. 영어는 authHref(?lang=en + 영어 페이지 next). 한국어는 authHref 가 next 를 싣지 않으므로
 * 여기서 safeNext 를 거친 현재 경로를 `?next=` 로 붙여 가입 뒤 보던 페이지로 돌아오게 한다(홈 '/' 는 생략).
 */
export function signupHref(lang: Language, currentPath?: string | null): string {
  if (lang === 'en') return authHref('signup', 'en', currentPath);
  const back = safeNext(currentPath, '');
  if (!back || back === '/') return authHref('signup', 'ko');
  return `/signup?next=${encodeURIComponent(back)}`;
}
