import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getAccountAuthInfo } from '@/lib/auth/account';
import { createResetToken } from '@/lib/auth/passwordReset';
import { appUrl, getMailer } from '@/lib/mail/mailer';
import { clientIp, rateLimit } from '@/lib/rateLimit';

// 비밀번호 없는(구글 전용) 계정의 "비밀번호 설정" 메일 발송.
//
// 세션만으로 바로 설정하게 하지 않는 이유: 비밀번호는 새 로그인 수단이다. 탈취된 세션으로 비밀번호를 정할 수
// 있으면 피해자가 구글 쪽에서 접근을 끊어도 공격자의 로그인이 남는다. 메일 링크는 메일함 소유를 한 번 더
// 확인하고, 완료 시 token_version 이 올라 기존 세션(탈취된 것 포함)도 모두 끊긴다(updateUserPassword).
// 링크·토큰은 비밀번호 재설정과 같은 것(/reset, 1시간, 1회성)을 쓴다 — 완료 경로가 하나여야 has_password 갱신이 한 곳에 모인다.
// 받는 주소는 요청 본문이 아니라 DB 의 계정 이메일이다.
export async function POST(req: Request): Promise<Response> {
  try {
    const session = await getCurrentUser();
    if (!session) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    const rl = rateLimit(`password-setup:${session.sub}:${clientIp(req)}`, 3, 10 * 60_000);
    if (!rl.ok) {
      throw new AppError(429, 'rate_limited', `너무 많이 요청했습니다. ${rl.retryAfter}초 후 다시 시도해 주세요.`);
    }
    const info = await getAccountAuthInfo(session.sub);
    if (!info) {
      throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');
    }
    if (info.hasPassword) {
      throw new AppError(409, 'password_already_set', '이미 비밀번호가 있는 계정입니다. 비밀번호 변경을 이용해 주세요.');
    }

    const token = await createResetToken(session.sub);
    const link = `${appUrl()}/reset?token=${token}`;
    await getMailer().send(
      info.email,
      'CertNote 비밀번호 설정',
      `<p>아래 링크에서 비밀번호를 설정하세요. 설정하면 구글 로그인과 함께 이메일·비밀번호로도 로그인할 수 있습니다. 1시간 동안 유효합니다.</p><p><a href="${link}">${link}</a></p>`,
    );
    return Response.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
