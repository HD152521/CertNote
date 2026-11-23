import type { Language } from '@/lib/i18n';

// 비로그인 맛보기 API 오류 문구. 요청 body 의 lang 에 맞춘다(영어 화면에 한국어 오류가 새지 않게).
const MESSAGES = {
  ko: {
    rateLimited: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    invalidCert: '자격증을 확인할 수 없습니다.',
    noQuestions: '해당 범위에 문제가 없습니다.',
    badRequest: '요청 형식이 올바르지 않습니다.',
    notFound: '문제를 찾을 수 없습니다.',
  },
  en: {
    rateLimited: 'Too many requests. Please try again in a moment.',
    invalidCert: 'Could not find that certification.',
    noQuestions: 'There are no questions for that selection.',
    badRequest: 'The request is not valid.',
    notFound: 'Question not found.',
  },
} as const;

export function previewMessage(lang: Language, key: keyof (typeof MESSAGES)['ko']): string {
  return MESSAGES[lang][key];
}
