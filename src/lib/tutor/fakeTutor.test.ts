import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_FAIL_BEFORE_TEXT,
  FAKE_FAIL_MID_STREAM,
  FAKE_TUTOR_TEXT,
  fakeTutorStream,
  isFakeTutorEnabled,
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

describe('fakeTutorStream', () => {
  const collect = async (selected: string) => {
    const out: string[] = [];
    for await (const e of fakeTutorStream(selected)) out.push(e.delta.text);
    return out;
  };

  it('ok 모드는 가짜 설명을 내보낸다', async () => {
    expect(await collect('B')).toEqual([FAKE_TUTOR_TEXT]);
  });

  it('fail-before-text 모드는 텍스트 없이 던진다', async () => {
    const out: string[] = [];
    await expect(
      (async () => {
        for await (const e of fakeTutorStream(FAKE_FAIL_BEFORE_TEXT)) out.push(e.delta.text);
      })(),
    ).rejects.toThrow();
    expect(out).toEqual([]);
  });

  it('mid-stream 모드는 텍스트 후 던진다', async () => {
    const out: string[] = [];
    await expect(
      (async () => {
        for await (const e of fakeTutorStream(FAKE_FAIL_MID_STREAM)) out.push(e.delta.text);
      })(),
    ).rejects.toThrow();
    expect(out).toEqual([FAKE_TUTOR_TEXT]);
  });
});
