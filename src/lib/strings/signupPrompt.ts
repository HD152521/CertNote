import { PAYWALL_ENABLED } from '../entitlement/policy';
import type { Language } from '../i18n';
import type { Dict } from './dict';

// 가입 권유 문구. 계정이 실제로 해 주는 일(오답 노트·간격반복 복습·모의고사·학습 기록)만, 앞으로 생길 일로 말한다 —
// 비로그인 상태의 풀이는 저장되지 않으므로 "이미 저장됐다"로 읽히면 안 된다.
// 영어판은 모의고사가 한국어 전용이라 모의고사를 언급하지 않는다. 실습은 오답이 없으므로 labDone 은 오답을 말하지 않는다.
// '무료'는 문장에 넣지 않고 버튼에만 둔다(아래 freeCta) — 페이월이 돌아오면 getSignupPromptStrings 가 자동으로 뺀다.
type SignupPromptKey = 'quizAnswered' | 'labDone' | 'home' | 'cta' | 'freeCta' | 'region' | 'close';

export const signupPromptStrings: Dict<SignupPromptKey> = {
  ko: {
    quizAnswered: '가입하면 이때부터 틀린 문제를 오답 노트에 모아 두고, 복습할 때가 되면 다시 풀어 볼 수 있어요.',
    labDone: '실습을 마쳤어요. 가입하면 학습 기록(연속 학습일·진도)을 대시보드에서 보고, 모의고사로 실력을 확인할 수 있어요.',
    home: '가입하면 틀린 문제를 오답 노트에 모아 복습하고, 학습 기록과 모의고사를 쓸 수 있어요.',
    cta: '가입하기',
    freeCta: '무료로 가입하기',
    region: '계정 만들기 안내',
    close: '오늘 하루 보지 않기',
  },
  en: {
    quizAnswered: 'Sign up to keep a wrong-answer notebook from now on, with spaced-repetition review of the questions you miss.',
    labDone: 'Lab finished. With an account, your study streak and progress are tracked on a dashboard.',
    home: 'An account keeps a wrong-answer notebook with spaced-repetition review, and tracks your study streak.',
    cta: 'Create an account',
    freeCta: 'Create a free account',
    region: 'Create an account',
    close: 'Hide for today',
  },
};

type Resolved = Record<Exclude<SignupPromptKey, 'freeCta'>, string>;

/** 화면에 쓰는 문구. 버튼의 '무료' 표기는 정책 스위치(PAYWALL_ENABLED)를 따른다. */
export function getSignupPromptStrings(lang: Language, paywallEnabled: boolean = PAYWALL_ENABLED): Resolved {
  const { freeCta, ...rest } = signupPromptStrings[lang];
  return { ...rest, cta: paywallEnabled ? rest.cta : freeCta };
}
