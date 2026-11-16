import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_PROFILE_OPTION_VALUES,
  AUTH_ERROR_EN,
  AUTH_ERROR_EN_FALLBACK,
  PROFILE_OPTION_LABEL_EN,
  authErrorMessage,
  profileSelectOptions,
} from './auth';
import { COMMON_STRINGS } from '../i18n';
import { privacyStrings } from './privacy';
import { shellStrings } from './shell';
import { chromeStrings } from './chrome';
import { pricingStrings } from './pricing';
import { verifyStrings } from './verify';
import { accountStrings } from './account';

const HANGUL = /[ㄱ-ㆎ가-힣]/;

describe('auth error strings', () => {
  it('has no Hangul in English messages', () => {
    for (const msg of [...Object.values(AUTH_ERROR_EN), AUTH_ERROR_EN_FALLBACK]) expect(msg).not.toMatch(HANGUL);
  });
  it('covers every code the signup/login/forgot/reset/verify endpoints can return', () => {
    for (const code of [
      'invalid_body', 'missing_credentials', 'invalid_email', 'weak_password', 'email_taken', 'invalid_credentials',
      'consent_required', 'name_required', 'birthdate_required', 'target_cert_required', 'invalid_token', 'rate_limited',
    ]) expect(AUTH_ERROR_EN).toHaveProperty(code);
  });
  it('keeps the Korean server message for ko and never leaks it into en', () => {
    const data = { error: 'invalid_credentials', message: '이메일 또는 비밀번호가 올바르지 않습니다.' };
    expect(authErrorMessage('ko', data, 'x')).toBe(data.message);
    expect(authErrorMessage('en', data, 'x')).toBe(AUTH_ERROR_EN.invalid_credentials);
    expect(authErrorMessage('en', { error: 'something_new', message: '한국어' }, 'x')).toBe(AUTH_ERROR_EN_FALLBACK);
    expect(authErrorMessage('en', null, 'x')).toBe(AUTH_ERROR_EN_FALLBACK);
    expect(authErrorMessage('ko', null, '대체')).toBe('대체');
  });
  it('does not treat prototype keys as codes', () => {
    expect(authErrorMessage('en', { error: 'constructor' }, 'x')).toBe(AUTH_ERROR_EN_FALLBACK);
  });
});

describe('profile option labels', () => {
  it('translates every Korean option value and keeps the submitted value Korean', () => {
    for (const v of ALL_PROFILE_OPTION_VALUES) {
      expect(PROFILE_OPTION_LABEL_EN[v], v).toBeTruthy();
      expect(PROFILE_OPTION_LABEL_EN[v]).not.toMatch(HANGUL);
    }
    const en = profileSelectOptions(ALL_PROFILE_OPTION_VALUES, 'en');
    expect(en.map((o) => o.value)).toEqual([...ALL_PROFILE_OPTION_VALUES]);
    const ko = profileSelectOptions(ALL_PROFILE_OPTION_VALUES, 'ko');
    expect(ko.every((o) => o.label === o.value)).toBe(true);
  });
});

describe('English strings on the auth funnel', () => {
  const keys = (o: object) => Object.keys(o).sort();
  it('ko/en key sets match', () => {
    expect(keys(COMMON_STRINGS.ko)).toEqual(keys(COMMON_STRINGS.en));
    for (const d of [privacyStrings, shellStrings, chromeStrings, pricingStrings, verifyStrings, accountStrings]) {
      expect(keys(d.ko)).toEqual(keys(d.en));
    }
  });
  it('has no Hangul in the English strings the funnel renders', () => {
    const authKeys = [
      'login', 'signup', 'forgotPassword', 'resetPassword', 'verifyEmail', 'email', 'password', 'name', 'birthdate',
      'targetCert', 'selectOne', 'additionalInfo', 'additionalInfoDesc', 'occupation', 'purpose', 'experienceLevel',
      'doNotSelect', 'consentText', 'privacyPolicy', 'processing', 'or', 'continueWithGoogle', 'googleContinueText',
      'googleAgreeTerms', 'dontHaveAccount', 'alreadyHaveAccount', 'somethingWentWrong', 'networkError', 'requestFailed',
      'pushNotificationTitle', 'pushNotificationDesc', 'enableNotifications', 'later', 'backToLogin', 'backToHome',
      'forgotPasswordQuestion', 'weSentResetLink', 'enterEmailForReset', 'sendResetLink', 'sending', 'invalidLink',
      'passwordChanged', 'enterNewPassword', 'newPassword', 'changing', 'changePassword', 'verifyingEmail',
      'emailVerified', 'loading',
    ];
    const en = COMMON_STRINGS.en as Record<string, string>;
    for (const k of authKeys) {
      expect(en[k], k).toBeTruthy();
      expect(en[k], k).not.toMatch(HANGUL);
    }
    for (const d of [privacyStrings, chromeStrings, pricingStrings, verifyStrings]) {
      // 사업자명 '주간랩스'는 법적 상호라 영어 방침에도 병기한다(의도된 예외).
      for (const [k, v] of Object.entries(d.en)) expect(v.replaceAll('주간랩스', ''), k).not.toMatch(HANGUL);
    }
    for (const k of ['tutorLoginTitle', 'tutorLoginBody', 'tutorSignup', 'tutorLogin'] as const) {
      expect(shellStrings.en[k]).not.toMatch(HANGUL);
    }
  });
});

describe('English-reachable links to auth screens', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  const files = [
    'src/app/(ko)/privacy/PrivacyContent.tsx',
    'src/app/(ko)/pricing/PricingContent.tsx',
    'src/components/AuthNav.tsx',
    'src/components/Paywall.tsx',
    'src/components/tutor/TutorPanel.tsx',
  ];
  it('build /login and /signup through authHref, not bare Korean hrefs', () => {
    for (const f of files) {
      const src = read(f);
      expect(src, f).toContain('authHref(');
      expect(src, f).not.toMatch(/href=["']\/(login|signup)["']/);
    }
  });
});
