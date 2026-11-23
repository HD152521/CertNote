import { normalizeLanguage, type Language } from '../i18n';
import { fmt, pick } from '../strings/dict';
import { mailStrings } from '../strings/mail';

export type AuthMailKind = 'verify' | 'reset' | 'setup';

/** 요청 본문의 lang 값을 정규화한다. 'en' 만 영어, 그 외는 한국어. */
export function mailLanguage(raw: unknown): Language {
  return normalizeLanguage(raw);
}

/** 메일 속 링크. 영어는 `?lang=en` 을 붙여 새 기기·브라우저에서도 영어로 열리게 한다. */
export function tokenLink(baseUrl: string, path: string, token: string, lang: Language): string {
  const suffix = lang === 'en' ? '&lang=en' : '';
  return `${baseUrl}${path}?token=${token}${suffix}`;
}

export function buildAuthMail(kind: AuthMailKind, link: string, lang: Language): { subject: string; html: string } {
  const s = pick(mailStrings, lang);
  return { subject: s[`${kind}Subject`], html: fmt(s[`${kind}Body`], { link }) };
}
