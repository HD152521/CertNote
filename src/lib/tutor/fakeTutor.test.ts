import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_TUTOR_MODE_HEADER,
  FAKE_TUTOR_TEXT,
  fakeTutorStream,
  isFakeTutorEnabled,
  resolveFakeMode,
  type FakeTutorMode,
} from './fakeTutor';

afterEach(() => vi.unstubAllEnvs());

describe('isFakeTutorEnabled — 운영 차단', () => {
  it('E2E_FAKE_TUTOR=1 이고 VERCEL 이 없으면 켜진다', () => {
    vi.stubEnv('E2E_FAKE_TUTOR', '1');
    vi.stubEnv('VERCEL', '');
    expect(isFakeTutorEnabled()).toBe(true);
  });

  it('VERCEL 이 설정돼 있으면 E2E_FAKE_TUTOR=1 이어도 꺼진다', () => {
    vi.stubEnv('E2E_FAKE_TUTOR', '1');
    vi.stubEnv('VERCEL', '1');
    expect(isFakeTutorEnabled()).toBe(false);
  });

  it('E2E_FAKE_TUTOR 가 없으면 꺼진다', () => {
    vi.stubEnv('E2E_FAKE_TUTOR', '');
    vi.stubEnv('VERCEL', '');
    expect(isFakeTutorEnabled()).toBe(false);
  });
});

describe('resolveFakeMode — 요청 헤더로 모드 선택', () => {
  const withHeader = (value?: string) =>
    new Headers(value === undefined ? {} : { [FAKE_TUTOR_MODE_HEADER]: value });

  it('가짜 모드가 꺼져 있으면 헤더가 있어도 무시한다(undefined)', () => {
    vi.stubEnv('E2E_FAKE_TUTOR', '');
    vi.stubEnv('VERCEL', '');
    expect(resolveFakeMode(withHeader('fail-before-text'))).toBeUndefined();
  });

  it('VERCEL 환경에서는 켜져 있어도 헤더를 무시한다', () => {
    vi.stubEnv('E2E_FAKE_TUTOR', '1');
    vi.stubEnv('VERCEL', '1');
    expect(resolveFakeMode(withHeader('fail-mid-stream'))).toBeUndefined();
  });

  it.each<[string | undefined, FakeTutorMode]>([
    [undefined, 'ok'],
    ['', 'ok'],
    ['nonsense', 'ok'],
    ['ok', 'ok'],
    ['fail-before-text', 'fail-before-text'],
    ['fail-mid-stream', 'fail-mid-stream'],
  ])('켜져 있을 때 헤더 %j → %s', (header, expected) => {
    vi.stubEnv('E2E_FAKE_TUTOR', '1');
    vi.stubEnv('VERCEL', '');
    expect(resolveFakeMode(withHeader(header))).toBe(expected);
  });
});

describe('fakeTutorStream', () => {
  const drain = async (mode: FakeTutorMode) => {
    const out: string[] = [];
    let error: unknown;
    try {
      for await (const e of fakeTutorStream(mode)) out.push(e.delta.text);
    } catch (e) {
      error = e;
    }
    return { out, error };
  };

  it('ok 모드는 가짜 설명을 내보낸다', async () => {
    expect(await drain('ok')).toEqual({ out: [FAKE_TUTOR_TEXT], error: undefined });
  });

  it('fail-before-text 모드는 텍스트 없이 던진다', async () => {
    const { out, error } = await drain('fail-before-text');
    expect(out).toEqual([]);
    expect(error).toBeInstanceOf(Error);
  });

  it('fail-mid-stream 모드는 텍스트 후 던진다', async () => {
    const { out, error } = await drain('fail-mid-stream');
    expect(out).toEqual([FAKE_TUTOR_TEXT]);
    expect(error).toBeInstanceOf(Error);
  });
});
