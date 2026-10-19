import type { Dict } from './dict';

/**
 * 이메일 인증 안내·인증 메일 재발송(마이페이지·후기 작성·/verify) 전용 문자열.
 */
export type VerifyStringKey =
  | 'emailNotVerified'
  | 'emailNotVerifiedHint'
  | 'resendVerify'
  | 'resendSending'
  | 'resendSent'
  | 'resendRateLimited'
  | 'resendFailed'
  | 'reviewNeedsVerify'
  | 'verifyMissingToken'
  | 'verifyResendFromAccount';

export const verifyStrings: Dict<VerifyStringKey> = {
  ko: {
    emailNotVerified: '이메일 인증이 아직 완료되지 않았어요.',
    emailNotVerifiedHint: '가입할 때 보낸 인증 메일의 링크를 누르면 후기 작성 등 모든 기능을 쓸 수 있어요.',
    resendVerify: '인증 메일 다시 보내기',
    resendSending: '보내는 중…',
    resendSent: '인증 메일을 보냈어요. 메일함(스팸함 포함)을 확인해 주세요.',
    resendRateLimited: '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
    resendFailed: '메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
    reviewNeedsVerify: '이메일 인증 후 후기를 작성할 수 있습니다.',
    verifyMissingToken: '인증 링크가 올바르지 않습니다. 메일의 링크를 다시 열거나, 인증 메일을 다시 받아 주세요.',
    verifyResendFromAccount: '마이페이지에서 인증 메일 다시 받기',
  },
  en: {
    emailNotVerified: "Your email isn't verified yet.",
    emailNotVerifiedHint: 'Open the link in the verification email we sent when you signed up to unlock reviews and everything else.',
    resendVerify: 'Resend verification email',
    resendSending: 'Sending…',
    resendSent: 'Verification email sent. Please check your inbox (and spam folder).',
    resendRateLimited: 'Too many requests. Please try again in a moment.',
    resendFailed: "Couldn't send the email. Please try again shortly.",
    reviewNeedsVerify: 'Please verify your email before writing a review.',
    verifyMissingToken: 'This verification link is invalid. Open the link from the email again, or request a new verification email.',
    verifyResendFromAccount: 'Get a new verification email from My Page',
  },
};
