// 영어 방문자를 한국어 인증 화면으로 보내지 않기 위한 순수 함수 모음(서버·클라이언트 공용).
//
// /login·/signup 은 URL 에 /en 접두가 없어(noindex 라우트) 언어를 lang 쿠키가 정한다. 그런데 영어 페이지를
// 구경만 한 방문자에게는 그 쿠키가 없다. 그래서 영어 화면이 인증 링크를 만들 때 언어 힌트(?lang=en)와
// 돌아올 영어 경로(?next=/en/...)를 URL 에 실어 보낸다. 힌트는 "표시 언어"에만 쓰이고,
// 리다이렉트 목적지 검증(safeNext)·인증 로직은 건드리지 않는다.
import { safeNext } from './safeNext';
import { resolveLanguage, type Language } from '../i18n';

export const AUTH_LANG_PARAM = 'lang';

const EN_PATH = /^\/en(?:[/?#]|$)/;

/** 영어 공개 페이지 경로(/en, /en/...)인지. 검증은 safeNext 를 거친 값에만 쓴다. */
export function isEnglishPath(path: string): boolean {
  return EN_PATH.test(path);
}

// lang 쿠키가 언어를 정하는 로그인 후 앱 화면. 영어 사용자가 돌아가도 영어로 보인다.
// 공개 한국어 경로(/, /aws …)와 /pricing 처럼 어긋나는 경로는 넣지 않는다.
const EN_APP_PREFIXES = ['/exam', '/review', '/notebook', '/dashboard', '/account'] as const;

/** 쿠키가 언어를 정하는 앱 화면 경로인지(쿼리·해시 무시). safeNext 를 거친 값에만 쓴다. */
export function isEnglishAppPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  const inList = EN_APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // 쿠키가 en 이면 en, ko 면 ko 로 갈리는(= 쿠키 권위) 경로만.
  return inList && resolveLanguage(pathname, 'en') === 'en' && resolveLanguage(pathname, 'ko') === 'ko';
}

/**
 * 인증 화면의 URL 이 영어를 가리키는지. `?lang=en` 이거나, 돌아갈 곳(`?next=`)이 영어 페이지일 때만 'en'.
 * 그 외(한국어·값 없음·위조된 값)는 null — 호출자가 쿠키 언어로 되돌아간다. 'ko' 힌트는 만들지 않는다.
 */
export function authLangHint(langParam: string | null | undefined, nextParam: string | null | undefined): Language | null {
  if (langParam === 'en') return 'en';
  const next = safeNext(nextParam, '');
  return next && isEnglishPath(next) ? 'en' : null;
}

/**
 * 인증 화면 링크. 한국어는 기존 그대로(`/login`, `/signup`).
 * 영어는 `?lang=en` 을 붙이고, 현재 페이지가 영어 공개 페이지면 로그인 뒤 그 페이지로 돌아오게 `next` 도 붙인다.
 * `next` 는 safeNext 를 통과한 같은 출처의 영어 공개 경로, 또는 쿠키가 언어를 정하는 앱 경로(/exam 등)만 허용한다.
 */
export function authHref(kind: 'login' | 'signup', lang: Language, currentPath?: string | null): string {
  const base = `/${kind}`;
  if (lang !== 'en') return base;
  const qs = new URLSearchParams({ [AUTH_LANG_PARAM]: 'en' });
  const back = safeNext(currentPath, '');
  if (back && (isEnglishPath(back) || isEnglishAppPath(back))) qs.set('next', back);
  return `${base}?${qs.toString()}`;
}
