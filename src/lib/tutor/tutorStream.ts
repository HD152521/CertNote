// LLM 스트림 → HTTP 응답 본문 변환.
//
// 핵심: 첫 텍스트가 나오기 전에는 응답 헤더를 보내지 않는다(primeTutorStream). 이렇게 해야 "첫 바이트 전 실패"를
// 연결 끊김이 아니라 읽을 수 있는 JSON 오류 상태(502)로 돌려줄 수 있다. 첫 텍스트 이후의 실패는
// 이미 200 헤더가 나간 뒤라 스트림을 오류로 끝내는 수밖에 없다.

// SDK 스트림 이벤트 중 우리가 보는 부분만 느슨하게 표현(가짜 스트림과 SDK 스트림을 같은 타입으로 받는다).
// delta 는 이벤트 종류마다 모양이 달라(SDK 유니온) unknown 으로 받고 text_delta 일 때만 좁혀 읽는다.
export interface TutorStreamEvent {
  type: string;
  delta?: unknown;
}

function textOf(event: TutorStreamEvent): string {
  if (event.type !== 'content_block_delta') return '';
  const delta = event.delta as { type?: string; text?: string } | undefined;
  return delta?.type === 'text_delta' ? (delta.text ?? '') : '';
}

export interface PrimedTutorStream {
  first: string;
  iterator: AsyncIterator<TutorStreamEvent>;
}

// 첫 텍스트가 나올 때까지 읽는다. 텍스트 없이 끝나면 null, 그 전에 스트림이 던지면 그 오류를 전파한다.
export async function primeTutorStream(source: AsyncIterable<TutorStreamEvent>): Promise<PrimedTutorStream | null> {
  const iterator = source[Symbol.asyncIterator]();
  for (;;) {
    const result = await iterator.next();
    if (result.done) return null;
    const first = textOf(result.value);
    if (first) return { first, iterator };
  }
}

export interface PipeHooks {
  // 정상 종료 시 전체 텍스트와 함께 호출. 던져도 응답에는 영향이 없다(로그는 호출부 책임).
  onComplete: (full: string) => void | Promise<void>;
  // 첫 텍스트 이후 스트림이 실패했을 때(이미 나간 텍스트와 함께).
  onError: (err: unknown, partial: string) => void;
}

export function pipeTutorText(primed: PrimedTutorStream, hooks: PipeHooks): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const { iterator } = primed;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = primed.first;
      try {
        controller.enqueue(encoder.encode(primed.first));
        for (;;) {
          const result = await iterator.next();
          if (result.done) break;
          const piece = textOf(result.value);
          if (!piece) continue;
          full += piece;
          controller.enqueue(encoder.encode(piece));
        }
      } catch (err) {
        hooks.onError(err, full);
        controller.error(err);
        return;
      }
      try {
        await hooks.onComplete(full);
      } catch {
        // 후처리(캐시 저장 등) 실패는 이미 전달된 응답에 영향 없음 — 호출부가 onComplete 안에서 로깅한다.
      }
      controller.close();
    },
    async cancel() {
      // 클라이언트가 끊으면 업스트림 생성도 멈춘다(토큰 낭비 방지).
      await iterator.return?.();
    },
  });
}
