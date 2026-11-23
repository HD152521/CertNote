import { appUrl, getMailer } from './mailer';
import { buildAuthMail, tokenLink } from './authMail';
import { createVerificationToken } from '../auth/emailVerification';
import type { Language } from '../i18n';

// 인증 토큰 발급 + 인증 메일 발송을 한 곳에 모은다(가입/재발송 라우트에서 공용).
export async function sendVerificationEmail(userId: string, email: string, lang: Language = 'ko'): Promise<void> {
  const token = await createVerificationToken(userId);
  const link = tokenLink(appUrl(), '/verify', token, lang);
  const { subject, html } = buildAuthMail('verify', link, lang);
  await getMailer().send(email, subject, html);
}
