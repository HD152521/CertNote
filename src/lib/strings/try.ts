import type { Dict } from './dict';

// 가입 없이 풀어 보는 5문제 맛보기(/try, /en/try) 화면 문구. {code}·{total} 는 fmt 로 채운다.
export type TryKey =
  | 'metaTitle' | 'metaDescription' | 'eyebrow' | 'titleDefault' | 'titlePicked' | 'intro'
  | 'loading' | 'loadError' | 'networkError' | 'checkError' | 'retry' | 'multi'
  | 'check' | 'checking' | 'next' | 'seeResult' | 'resultTitle' | 'signupBody' | 'signupCta' | 'more';

export const tryStrings: Dict<TryKey> = {
  ko: {
    metaTitle: '가입 없이 5문제 풀어보기',
    metaDescription: '로그인 없이 모의고사 5문제를 풀고 바로 해설을 확인해 보세요.',
    eyebrow: 'Quick Try',
    titleDefault: '가입 없이 5문제 풀어보기',
    titlePicked: '{code} 5문제 맛보기',
    intro: '로그인 없이 풀고, 문제마다 바로 정답과 해설을 볼 수 있어요. 기록은 저장되지 않아요.',
    loading: '문제를 불러오는 중…',
    loadError: '문제를 불러오지 못했습니다.',
    networkError: '네트워크 오류가 발생했습니다.',
    checkError: '정답을 확인하지 못했습니다. 다시 시도해 주세요.',
    retry: '다시 시도',
    multi: ' · 복수 선택',
    check: '정답 확인',
    checking: '확인 중…',
    next: '다음 문제 →',
    seeResult: '결과 보기',
    resultTitle: '{code} 맛보기 결과',
    signupBody: '가입하면 {code} 모의고사 {total}문항을 실전처럼 풀고, 틀린 문제는 오답 노트에 모여 복습할 때 다시 나와요.',
    signupCta: '무료로 가입하고 전체 모의고사 풀기',
    more: '다른 5문제 더 풀어보기',
  },
  en: {
    metaTitle: 'Try 5 practice questions without signing up',
    metaDescription: 'Answer 5 mock-exam questions with no login and see the explanation right away.',
    eyebrow: 'Quick Try',
    titleDefault: 'Try 5 questions without signing up',
    titlePicked: '{code}: 5-question preview',
    intro: 'No login needed. You see the correct answer and explanation after each question. Nothing is saved.',
    loading: 'Loading questions…',
    loadError: 'Could not load the questions.',
    networkError: 'A network error occurred.',
    checkError: 'Could not check the answer. Please try again.',
    retry: 'Try again',
    multi: ' · select all that apply',
    check: 'Check answer',
    checking: 'Checking…',
    next: 'Next question →',
    seeResult: 'See results',
    resultTitle: '{code} preview results',
    signupBody: 'With an account you can take the full {total}-question {code} mock exam, and the questions you miss go into a wrong-answer notebook that brings them back for review.',
    signupCta: 'Create a free account and take the full mock exam',
    more: 'Try 5 more questions',
  },
};
