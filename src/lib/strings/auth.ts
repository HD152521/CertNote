import type { Language } from '../i18n';
import { OCCUPATION_OPTIONS, PURPOSE_OPTIONS, EXPERIENCE_OPTIONS } from '../profileOptions';

// 인증 화면(로그인·가입·재설정·인증·온보딩)에서 서버 응답을 영어로 보여 주기 위한 문구.
// 서버(api/auth/*)는 한국어 message 를 돌려준다. 서버는 건드리지 않고(검증·한도·오류 코드 그대로),
// 영어 화면에서만 `error` 코드로 영어 문구를 고른다. 코드가 목록에 없으면 한국어 message 를 그대로
// 쓰지 않고 일반 영어 문구로 대신한다 — 영어 화면에 한글이 새지 않게.

export const AUTH_ERROR_EN: Readonly<Record<string, string>> = {
  invalid_body: 'The request was not valid. Please check your input and try again.',
  missing_credentials: 'Please enter your email and password.',
  invalid_email: 'Please enter a valid email address.',
  weak_password: 'Your password must be at least 8 characters.',
  email_taken: 'An account with this email already exists.',
  invalid_credentials: 'Incorrect email or password.',
  consent_required: 'Please agree to the collection and use of personal information.',
  name_required: 'Please enter your name.',
  birthdate_required: 'Please enter your date of birth.',
  target_cert_required: 'Please choose your target certification.',
  invalid_token: 'This link has expired or was already used. Please request a new one.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  unauthorized: 'Please log in to continue.',
  internal_error: 'Something went wrong on our side. Please try again in a moment.',
};

export const AUTH_ERROR_EN_FALLBACK = 'Something went wrong. Please try again.';

/**
 * 서버 오류 응답 → 화면 문구. 한국어는 서버 message 그대로(기존 동작). 영어는 코드별 영어 문구.
 * `fallback` 은 message 가 없을 때의 해당 언어 일반 문구.
 */
export function authErrorMessage(
  lang: Language,
  data: { error?: unknown; message?: unknown } | null | undefined,
  fallback: string,
): string {
  if (lang === 'en') {
    const code = typeof data?.error === 'string' ? data.error : '';
    return Object.hasOwn(AUTH_ERROR_EN, code) ? AUTH_ERROR_EN[code] : AUTH_ERROR_EN_FALLBACK;
  }
  return typeof data?.message === 'string' && data.message ? data.message : fallback;
}

// 프로필 선택지. 서버로 가는 값은 한국어 원문(저장·통계 키)이고 화면 라벨만 영어로 바꾼다.
export const PROFILE_OPTION_LABEL_EN: Readonly<Record<string, string>> = {
  '학생': 'Student',
  '취업 준비생': 'Job seeker',
  '직장인 (IT·개발)': 'Working professional (IT / dev)',
  '직장인 (비IT)': 'Working professional (non-IT)',
  '프리랜서': 'Freelancer',
  '자영업': 'Self-employed',
  '기타': 'Other',
  '취업 준비': 'Job hunting',
  '이직': 'Changing jobs',
  '승진/평가': 'Promotion / review',
  '자기계발': 'Self-improvement',
  '학교/학점': 'School / credits',
  '비전공·입문': 'Non-major / beginner',
  'IT 1년 미만': 'Under 1 year in IT',
  '1~3년': '1-3 years',
  '3~5년': '3-5 years',
  '5년 이상': '5+ years',
};

export const ALL_PROFILE_OPTION_VALUES: readonly string[] = [
  ...new Set([...OCCUPATION_OPTIONS, ...PURPOSE_OPTIONS, ...EXPERIENCE_OPTIONS]),
];

/** `<Select>` 옵션으로. value 는 항상 한국어 원문, label 만 언어별. */
export function profileSelectOptions(values: readonly string[], lang: Language): { value: string; label: string }[] {
  return values.map((value) => ({
    value,
    label: lang === 'en' ? (PROFILE_OPTION_LABEL_EN[value] ?? value) : value,
  }));
}
