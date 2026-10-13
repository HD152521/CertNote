import { describe, expect, it, vi } from 'vitest';
import { primeTutorStream, pipeTutorText, type TutorStreamEvent } from './tutorStream';

const text = (t: string): TutorStreamEvent => ({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } });
const meta = (type: string): TutorStreamEvent => ({ type });
const jsonDelta: TutorStreamEvent = { type: 'content_block_delta', delta: { type: 'input_json_delta' } };

async function* gen(events: TutorStreamEvent[], failAfter?: Error): AsyncGenerator<TutorStreamEvent> {
  for (const e of events) yield e;
  if (failAfter) throw failAfter;
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<{ text: string; error: unknown }> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let acc = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return { text: acc, error: undefined };
      acc += dec.decode(value, { stream: true });
    }
  } catch (error) {
    return { text: acc, error };
  }
}

describe('primeTutorStream', () => {
  it('텍스트가 아닌 선행 이벤트를 건너뛰고 첫 텍스트를 돌려준다', async () => {
    const primed = await primeTutorStream(gen([meta('message_start'), meta('content_block_start'), jsonDelta, text('안녕'), text('하세요')]));
    expect(primed?.first).toBe('안녕');
  });

  it('텍스트 없이 끝나면 null', async () => {
    expect(await primeTutorStream(gen([meta('message_start'), meta('message_stop')]))).toBeNull();
  });

  it('빈 문자열 텍스트 델타는 텍스트로 치지 않는다', async () => {
    expect(await primeTutorStream(gen([text('')]))).toBeNull();
  });

  it('첫 텍스트 전에 던지면 그대로 전파한다', async () => {
    await expect(primeTutorStream(gen([meta('message_start')], new Error('boom')))).rejects.toThrow('boom');
  });
});

describe('pipeTutorText', () => {
  it('첫 조각과 나머지를 순서대로 내보내고 완료 콜백에 전체 텍스트를 넘긴다', async () => {
    const primed = await primeTutorStream(gen([text('A'), text('B'), meta('message_stop'), text('C')]));
    const onComplete = vi.fn();
    const onError = vi.fn();
    const result = await readAll(pipeTutorText(primed!, { onComplete, onError }));
    expect(result).toEqual({ text: 'ABC', error: undefined });
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('ABC');
    expect(onError).not.toHaveBeenCalled();
  });

  it('중간 실패는 스트림을 오류로 끝내고 지금까지의 텍스트와 함께 오류 콜백을 부른다', async () => {
    const primed = await primeTutorStream(gen([text('A'), text('B')], new Error('mid')));
    const onComplete = vi.fn();
    const onError = vi.fn();
    const result = await readAll(pipeTutorText(primed!, { onComplete, onError }));
    expect(result.text).toBe('AB');
    expect((result.error as Error).message).toBe('mid');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toBe('AB');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('완료 콜백이 던져도 응답은 정상 종료된다(캐시 저장 실패가 사용자에게 번지지 않음)', async () => {
    const primed = await primeTutorStream(gen([text('A')]));
    const onComplete = vi.fn().mockRejectedValue(new Error('cache down'));
    const result = await readAll(pipeTutorText(primed!, { onComplete, onError: vi.fn() }));
    expect(result).toEqual({ text: 'A', error: undefined });
  });
});
