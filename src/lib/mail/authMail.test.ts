import { describe, expect, it } from 'vitest';
import { buildAuthMail, mailLanguage, tokenLink } from './authMail';

describe('mailLanguage', () => {
  it('treats only "en" as English', () => {
    expect(mailLanguage('en')).toBe('en');
    expect(mailLanguage('ko')).toBe('ko');
    expect(mailLanguage('EN')).toBe('ko');
    expect(mailLanguage(undefined)).toBe('ko');
    expect(mailLanguage({})).toBe('ko');
  });
});

describe('tokenLink', () => {
  it('keeps the Korean link unchanged', () => {
    expect(tokenLink('https://x.io', '/verify', 'abc', 'ko')).toBe('https://x.io/verify?token=abc');
  });
  it('adds lang=en for English', () => {
    expect(tokenLink('https://x.io', '/reset', 'abc', 'en')).toBe('https://x.io/reset?token=abc&lang=en');
  });
});

describe('buildAuthMail', () => {
  const link = 'https://x.io/verify?token=abc';
  it('keeps the Korean wording exactly as before', () => {
    expect(buildAuthMail('verify', link, 'ko')).toEqual({
      subject: 'CertNote 이메일 인증',
      html: `<p>아래 링크를 눌러 이메일을 인증해 주세요. 24시간 동안 유효합니다.</p><p><a href="${link}">${link}</a></p>`,
    });
    expect(buildAuthMail('reset', link, 'ko')).toEqual({
      subject: 'CertNote 비밀번호 재설정',
      html: `<p>아래 링크에서 비밀번호를 재설정하세요. 1시간 동안 유효합니다.</p><p><a href="${link}">${link}</a></p>`,
    });
    expect(buildAuthMail('setup', link, 'ko').subject).toBe('CertNote 비밀번호 설정');
  });
  it('has no Hangul in English mail and embeds the link', () => {
    for (const kind of ['verify', 'reset', 'setup'] as const) {
      const m = buildAuthMail(kind, link, 'en');
      expect(`${m.subject}${m.html}`).not.toMatch(/[가-힣]/);
      expect(m.html).toContain(`href="${link}"`);
    }
  });
});
