import { describe, expect, it } from 'vitest';
import { classifyTutorFailure, tutorFailureMessage, type TutorErrorStrings } from './tutorClient';

describe('classifyTutorFailure — /api/tutor 오류 응답 → 패널 상태', () => {
  it('401 은 로그인 유도', () => {
    expect(classifyTutorFailure(401, { error: 'unauthorized' })).toEqual({ kind: 'login' });
  });

  it('403 email_unverified 는 이메일 인증 안내', () => {
    expect(classifyTutorFailure(403, { error: 'email_unverified', message: 'x' })).toEqual({ kind: 'verify' });
  });

  it('다른 403 은 인증 안내가 아니라 일반 오류(서버 메시지 보존)', () => {
    expect(classifyTutorFailure(403, { error: 'forbidden', message: 'nope' })).toEqual({
      kind: 'error',
      code: 'forbidden',
      message: 'nope',
    });
  });

  it.each([
    [429, 'daily_limit', '한도'],
    [503, 'global_limit', '용량'],
    [502, 'tutor_failed', '실패'],
    [400, 'invalid_selected', '형식'],
  ])('%i %s 는 일반 오류로 코드와 메시지를 넘긴다', (status, code, message) => {
    expect(classifyTutorFailure(status, { error: code, message })).toEqual({ kind: 'error', code, message });
  });

  it('본문이 비어 있어도 던지지 않는다', () => {
    expect(classifyTutorFailure(500, {})).toEqual({ kind: 'error', code: undefined, message: undefined });
  });
});

describe('tutorFailureMessage — 재시도 거절 사유를 문구로', () => {
  const S: TutorErrorStrings = {
    tutorRateLimited: 'S:rate',
    tutorUnavailable: 'S:unavailable',
    tutorQuestionNotFound: 'S:notfound',
    tutorGlobalLimit: 'S:global',
    tutorStreamFailed: 'S:stream',
    tutorInvalidSelected: 'S:selected',
    tutorLoadFailed: 'S:load',
  };

  it.each([
    [429, 'rate_limited', 'S:rate'],
    [503, 'global_limit', 'S:global'],
    [502, 'tutor_failed', 'S:stream'],
    [503, 'tutor_unavailable', 'S:unavailable'],
  ])('%i %s 는 현지화 문구를 쓴다', (status, code, expected) => {
    const f = classifyTutorFailure(status, { error: code, message: 'server' });
    if (f.kind !== 'error') throw new Error('error 종류여야 한다');
    expect(tutorFailureMessage(f, S)).toBe(expected);
  });

  it('모르는 코드는 서버 message, 그것도 없으면 기본 문구', () => {
    expect(tutorFailureMessage({ kind: 'error', code: 'daily_limit', message: '하루 한도' }, S)).toBe('하루 한도');
    expect(tutorFailureMessage({ kind: 'error' }, S)).toBe('S:load');
  });
});
