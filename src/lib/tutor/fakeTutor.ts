// E2E 전용 가짜 튜터 스트림. 실제 LLM(Anthropic)을 부르지 않고 SDK 스트림 이벤트 모양만 흉내 낸다.
//
// 운영 차단(중요): Vercel 배포(process.env.VERCEL 이 존재하는 모든 환경 — production/preview 포함)에서는
// E2E_FAKE_TUTOR 가 켜져 있어도 절대 활성화되지 않는다. 이 환경변수는 playwright.config.ts 의 webServer.env
// 에서만 설정한다. 이 함수 외의 곳에서 E2E_FAKE_TUTOR 를 직접 읽지 말 것.
//
// 모드 선택은 요청의 `selected` 값(센티널 문자열)으로 한다. 가짜 모드가 꺼져 있으면 이 값은 그냥 일반 입력이다.
export const FAKE_TUTOR_TEXT = '[E2E-FAKE] 가짜 튜터 설명입니다.';
export const FAKE_FAIL_BEFORE_TEXT = 'E2E_FAIL_BEFORE_TEXT';
export const FAKE_FAIL_MID_STREAM = 'E2E_FAIL_MID_STREAM';

export function isFakeTutorEnabled(): boolean {
  if (process.env.VERCEL) return false;
  return process.env.E2E_FAKE_TUTOR === '1';
}

export interface FakeTutorEvent {
  type: 'content_block_delta';
  delta: { type: 'text_delta'; text: string };
}

const textEvent = (text: string): FakeTutorEvent => ({
  type: 'content_block_delta',
  delta: { type: 'text_delta', text },
});

export async function* fakeTutorStream(selected: string): AsyncGenerator<FakeTutorEvent> {
  if (selected === FAKE_FAIL_BEFORE_TEXT) throw new Error('E2E fake: fail before any text');
  yield textEvent(FAKE_TUTOR_TEXT);
  if (selected === FAKE_FAIL_MID_STREAM) throw new Error('E2E fake: fail mid stream');
}
