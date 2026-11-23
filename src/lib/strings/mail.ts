import type { Dict } from './dict';

/** 인증·비밀번호 메일 문구. 메일 본문은 `{link}` 자리에 링크가 들어간다. */
export type MailStringKey =
  | 'verifySubject'
  | 'verifyBody'
  | 'resetSubject'
  | 'resetBody'
  | 'setupSubject'
  | 'setupBody';

export const mailStrings: Dict<MailStringKey> = {
  ko: {
    verifySubject: 'CertNote 이메일 인증',
    verifyBody: '<p>아래 링크를 눌러 이메일을 인증해 주세요. 24시간 동안 유효합니다.</p><p><a href="{link}">{link}</a></p>',
    resetSubject: 'CertNote 비밀번호 재설정',
    resetBody: '<p>아래 링크에서 비밀번호를 재설정하세요. 1시간 동안 유효합니다.</p><p><a href="{link}">{link}</a></p>',
    setupSubject: 'CertNote 비밀번호 설정',
    setupBody:
      '<p>아래 링크에서 비밀번호를 설정하세요. 설정하면 구글 로그인과 함께 이메일·비밀번호로도 로그인할 수 있습니다. 1시간 동안 유효합니다.</p><p><a href="{link}">{link}</a></p>',
  },
  en: {
    verifySubject: 'Verify your CertNote email',
    verifyBody: '<p>Click the link below to verify your email. It is valid for 24 hours.</p><p><a href="{link}">{link}</a></p>',
    resetSubject: 'Reset your CertNote password',
    resetBody: '<p>Use the link below to reset your password. It is valid for 1 hour.</p><p><a href="{link}">{link}</a></p>',
    setupSubject: 'Set your CertNote password',
    setupBody:
      '<p>Use the link below to set a password. Once set, you can sign in with your email and password as well as Google. It is valid for 1 hour.</p><p><a href="{link}">{link}</a></p>',
  },
};
