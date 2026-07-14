import type { Language } from '@/lib/i18n';

/**
 * 튜터 기능의 오류 메시지 (한국어, 영어)
 */
export const TUTOR_ERRORS = {
  ko: {
    proRequired: 'AI 오답 튜터는 Pro 플랜 전용 기능입니다. Pro로 업그레이드하세요.',
    rateLimited: '요청이 많아서 대기 중입니다. 잠시 후 다시 시도하세요.',
    networkError: '네트워크 연결을 확인하고 다시 시도하세요.',
    invalidQuestion: '문제를 찾을 수 없습니다. 다시 시도하세요.',
    questionIdRequired: '문제 ID가 필요합니다.',
    tutorUnavailable: 'AI 튜터가 아직 설정되지 않았습니다.',
    dailyLimitExceeded: '오늘 AI 설명 한도를 모두 사용했어요. 내일 다시 이용해 주세요.',
    unauthorized: '로그인이 필요합니다.',
    timeout: '응답이 늦어졌습니다. 다시 시도하세요.',
    unknownError: 'AI 튜터 오류가 발생했습니다. 다시 시도하세요.',
    thinking: '생각 중...',
  },
  en: {
    proRequired: 'AI tutor is a Pro-only feature. Upgrade to Pro to use it.',
    rateLimited: 'Too many requests. Please wait and try again.',
    networkError: 'Please check your network connection and try again.',
    invalidQuestion: 'Question not found. Please try again.',
    questionIdRequired: 'Question ID is required.',
    tutorUnavailable: 'AI tutor is not available yet.',
    dailyLimitExceeded: 'Daily limit reached. Try again tomorrow.',
    unauthorized: 'Authentication required.',
    timeout: 'Response took too long. Please try again.',
    unknownError: 'An error occurred with the AI tutor. Please try again.',
    thinking: 'Thinking...',
  },
} as const;

/**
 * 특정 오류 타입과 언어에 해당하는 튜터 오류 메시지 조회
 * @example getTutorError('en', 'proRequired') → 'AI tutor is a Pro-only feature...'
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
