import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ stream: vi.fn(() => ({ fake: 'stream' })) }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: sdk.stream };
  },
}));

import { DEFAULT_TUTOR_GLOBAL_DAILY_LIMIT, DEFAULT_TUTOR_MODEL, getTutorModel, streamTutor } from './tutorService';
import type { IndexedQuestion } from '../questions';

const QUESTION = { id: 'q1', prompt: 'p', choices: [{ label: 'A', text: 'x' }], answer: 'A' } as unknown as IndexedQuestion;

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  vi.stubEnv('E2E_FAKE_TUTOR', '');
  vi.stubEnv('VERCEL', '');
  sdk.stream.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe('튜터 모델 선택', () => {
  it('기본 모델은 claude-haiku-4-5', () => {
    vi.stubEnv('TUTOR_MODEL', '');
    expect(DEFAULT_TUTOR_MODEL).toBe('claude-haiku-4-5');
    expect(getTutorModel()).toBe('claude-haiku-4-5');
  });

  it('TUTOR_MODEL 환경변수로 덮어쓸 수 있다', () => {
    vi.stubEnv('TUTOR_MODEL', 'claude-sonnet-4-6');
    expect(getTutorModel()).toBe('claude-sonnet-4-6');
  });

  it('streamTutor 는 기본 모델로 SDK 를 호출하고 Haiku 에는 effort 를 보내지 않는다', () => {
    vi.stubEnv('TUTOR_MODEL', '');
    streamTutor(QUESTION, 'B', [], 'ko');
    const args = (sdk.stream.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(args.model).toBe('claude-haiku-4-5');
    expect(args).not.toHaveProperty('output_config');
  });

  it('Opus 로 바꾸면 effort 를 함께 보낸다', () => {
    vi.stubEnv('TUTOR_MODEL', 'claude-opus-4-8');
    streamTutor(QUESTION, 'B', [], 'ko');
    const args = (sdk.stream.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(args.output_config).toEqual({ effort: 'medium' });
  });
});

describe('전역 일일 상한 기본값', () => {
  it('양의 정수이고 문서화된 값(500)이다', () => {
    expect(DEFAULT_TUTOR_GLOBAL_DAILY_LIMIT).toBe(500);
  });
});
