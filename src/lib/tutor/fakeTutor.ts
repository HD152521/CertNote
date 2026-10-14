// E2E 전용 가짜 튜터 스트림. 실제 LLM(Anthropic)을 부르지 않고 SDK 스트림 이벤트 모양만 흉내 낸다.
//
// 운영 차단(중요): Vercel 배포(process.env.VERCEL 이 존재하는 모든 환경 — production/preview 포함)에서는
// E2E_FAKE_TUTOR 가 켜져 있어도 절대 활성화되지 않는다. 이 환경변수는 playwright.config.ts 의 webServer.env
// 에서만 설정한다. 이 함수 외의 곳에서 E2E_FAKE_TUTOR 를 직접 읽지 말 것.
//
// 모드 선택은 요청 헤더(x-e2e-fake-tutor)로 한다. `selected` 같은 본문 필드는 입력 검증(보기 글자만 허용)을
// 통과해야 하므로 센티널을 실을 수 없다. 가짜 모드가 꺼져 있으면 이 헤더는 읽히지도 않는다(resolveFakeMode → undefined).
export const FAKE_TUTOR_TEXT = '[E2E-FAKE] 가짜 튜터 설명입니다.';
export const FAKE_TUTOR_MODE_HEADER = 'x-e2e-fake-tutor';

export type FakeTutorMode = 'ok' | 'fail-before-text' | 'fail-mid-stream';

export function isFakeTutorEnabled(): boolean {
  if (process.env.VERCEL) return false;
  return process.env.E2E_FAKE_TUTOR === '1';
}

// 가짜 모드가 꺼져 있으면 undefined(=헤더 무시), 켜져 있으면 헤더 값(모르는 값은 'ok').
export function resolveFakeMode(headers: Headers): FakeTutorMode | undefined {
  if (!isFakeTutorEnabled()) return undefined;
  const value = headers.get(FAKE_TUTOR_MODE_HEADER);
  return value === 'fail-before-text' || value === 'fail-mid-stream' ? value : 'ok';
}

export interface FakeTutorEvent {
  type: 'content_block_delta';
  delta: { type: 'text_delta'; text: string };
}

const textEvent = (text: string): FakeTutorEvent => ({
  type: 'content_block_delta',
  delta: { type: 'text_delta', text },
});

export async function* fakeTutorStream(mode: FakeTutorMode = 'ok'): AsyncGenerator<FakeTutorEvent> {
  if (mode === 'fail-before-text') throw new Error('E2E fake: fail before any text');
  yield textEvent(FAKE_TUTOR_TEXT);
  if (mode === 'fail-mid-stream') throw new Error('E2E fake: fail mid stream');
}
