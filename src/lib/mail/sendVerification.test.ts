import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
vi.mock('./mailer', () => ({ appUrl: () => 'https://x.io', getMailer: () => ({ send }) }));
vi.mock('../auth/emailVerification', () => ({ createVerificationToken: async () => 'tok' }));

import { sendVerificationEmail } from './sendVerification';

describe('sendVerificationEmail', () => {
  beforeEach(() => send.mockReset());

  it('sends Korean mail by default', async () => {
    await sendVerificationEmail('u1', 'a@b.co');
    const [to, subject, html] = send.mock.calls[0];
    expect(to).toBe('a@b.co');
    expect(subject).toBe('CertNote 이메일 인증');
    expect(html).toContain('https://x.io/verify?token=tok"');
    expect(html).not.toContain('lang=en');
  });

  it('sends English mail with a lang=en link', async () => {
    await sendVerificationEmail('u1', 'a@b.co', 'en');
    const [, subject, html] = send.mock.calls[0];
    expect(subject).toBe('Verify your CertNote email');
    expect(html).toContain('https://x.io/verify?token=tok&lang=en');
  });
});
