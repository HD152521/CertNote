import type { Dict } from './dict';

export type WaitlistKey =
  | 'submitFailed'
  | 'networkError'
  | 'joined'
  | 'emailPlaceholder'
  | 'submitting'
  | 'submit';

export const waitlistStrings: Dict<WaitlistKey> = {
  ko: {
    submitFailed: '등록에 실패했습니다.',
    networkError: '네트워크 오류가 발생했습니다.',
    joined: '등록 완료! 출시되면 가장 먼저 알려드릴게요. 🎉',
    emailPlaceholder: '이메일을 입력하세요',
    submitting: '등록 중…',
    submit: '출시 알림 받기',
  },
  en: {
    submitFailed: 'Sign-up failed.',
    networkError: 'A network error occurred.',
    joined: "You're on the list! We'll email you the moment it launches. 🎉",
    emailPlaceholder: 'Enter your email',
    submitting: 'Signing up…',
    submit: 'Notify me at launch',
  },
};
