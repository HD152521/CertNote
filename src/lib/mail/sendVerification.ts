import { appUrl, getMailer } from './mailer';
import { createVerificationToken } from '../auth/emailVerification';

// 인증 토큰 발급 + 인증 메일 발송을 한 곳에 모은다(가입/재발송 라우트에서 공용).
export async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const token = await createVerificationToken(userId);
  const link = `${appUrl()}/verify?token=${token}`;
  await getMailer().send(
    email,
    'CertNote 이메일 인증',
    `<p>아래 링크를 눌러 이메일을 인증해 주세요. 24시간 동안 유효합니다.</p><p><a href="${link}">${link}</a></p>`,
  );
}
