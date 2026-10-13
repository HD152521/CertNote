import type { Language } from '@/lib/i18n';

/**
 * 튜터 기능의 오류 메시지 (한국어, 영어)
 */
export const TUTOR_ERRORS = {
  ko: {
    rateLimited: '요청이 많아서 대기 중입니다. 잠시 후 다시 시도하세요.',
    networkError: '네트워크 연결을 확인하고 다시 시도하세요.',
    invalidQuestion: '문제를 찾을 수 없습니다. 다시 시도하세요.',
    questionIdRequired: '문제 ID가 필요합니다.',
    tutorUnavailable: 'AI 튜터가 아직 설정되지 않았습니다.',
    dailyLimitExceeded: '오늘 AI 설명 한도를 모두 사용했어요. 내일 다시 이용해 주세요.',
    unauthorized: 'AI 설명은 로그인 후 이용할 수 있습니다.',
    emailUnverified: 'AI 설명은 이메일 인증을 마친 계정에서 이용할 수 있어요. 가입 시 받은 인증 메일을 확인해 주세요.',
    invalidHistory: '대화 형식이 올바르지 않습니다. 질문으로 끝나는 대화만 보낼 수 있어요.',
    invalidSelected: '선택한 보기 형식이 올바르지 않습니다.',
    globalLimitExceeded: '오늘 AI 설명 이용이 많아 잠시 쉬고 있어요. 내일 다시 이용해 주세요.',
    streamFailed: 'AI 설명을 만들지 못했어요. 이번 시도는 횟수에서 차감되지 않았습니다. 잠시 후 다시 시도해 주세요.',
    timeout: '응답이 늦어졌습니다. 다시 시도하세요.',
    unknownError: 'AI 튜터 오류가 발생했습니다. 다시 시도하세요.',
    thinking: '생각 중...',
  },
  en: {
    rateLimited: 'Too many requests. Please wait and try again.',
    networkError: 'Please check your network connection and try again.',
    invalidQuestion: 'Question not found. Please try again.',
    questionIdRequired: 'Question ID is required.',
    tutorUnavailable: 'AI tutor is not available yet.',
    dailyLimitExceeded: 'Daily limit reached. Try again tomorrow.',
    unauthorized: 'Sign in to use the AI tutor.',
    emailUnverified: 'The AI tutor is available to accounts with a verified email. Please check the verification email we sent you.',
    invalidHistory: 'Invalid conversation format. The conversation must end with your question.',
    invalidSelected: 'The selected answer format is invalid.',
    globalLimitExceeded: 'The AI tutor has reached its daily capacity. Please try again tomorrow.',
    streamFailed: "We couldn't generate the explanation. This attempt did not count against your limit. Please try again shortly.",
    timeout: 'Response took too long. Please try again.',
    unknownError: 'An error occurred with the AI tutor. Please try again.',
    thinking: 'Thinking...',
  },
} as const;

/**
 * 특정 오류 타입과 언어에 해당하는 튜터 오류 메시지 조회
 * @example getTutorError('en', 'unauthorized') → 'Sign in to use the AI tutor.'
 */
export function getTutorError(
  lang: Language,
  key: keyof typeof TUTOR_ERRORS.ko
): string {
  const msg = TUTOR_ERRORS[lang][key];
  if (!msg) {
    console.error(`[i18n] Missing tutor error key: ${key}`);
    return TUTOR_ERRORS[lang]['unknownError'] || 'An error occurred';
  }
  return msg;
}

/**
 * 튜터 상태 메시지 조회 (예: "생각 중...")
 */
export function getTutorStatus(lang: Language, status: 'thinking'): string {
  return TUTOR_ERRORS[lang][status];
}
