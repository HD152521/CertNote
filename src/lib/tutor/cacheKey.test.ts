import { describe, expect, test } from 'vitest';
import { tutorCacheKey } from './cacheKey';

const BASE = {
  prompt: '가장 적절한 구성은?',
  choices: [
    { label: 'A', text: 'Amazon S3' },
    { label: 'B', text: 'Amazon EFS' },
  ],
  answer: 'A',
};

describe('tutorCacheKey — 튜터 첫 설명 캐시 키', () => {
  test('day 퀴즈 id 는 그대로 쓴다(기존 캐시 유지)', () => {
    expect(tutorCacheKey('saa-c03-w1-d1-q1', BASE)).toBe('saa-c03-w1-d1-q1');
  });

  test('문구를 고친 day 문제는 개정 접미사로 키가 바뀐다(예전 설명을 다시 쓰지 않는다)', () => {
    expect(tutorCacheKey('dva-c02-w3-d4-q6', BASE)).toBe('dva-c02-w3-d4-q6#r2');
    expect(tutorCacheKey('scs-c03-w8-d2-q2', BASE)).toBe('scs-c03-w8-d2-q2#r2');
  });

  test('개정 목록의 id 는 모두 실제 day 문제다(오타로 무효가 되지 않게)', async () => {
    const { getQuestionById } = await import('@/lib/questions');
    for (const id of ['dva-c02-w11-d1-q5', 'dva-c02-w3-d4-q6', 'dva-c02-w5-d1-q5', 'dva-c02-w5-d1-q7', 'saa-c03-w12-d1-q2', 'scs-c03-w9-d5-q5']) {
      expect(getQuestionById(id), id).toBeTruthy();
    }
  });

  test('모의고사 id 에는 내용 지문을 붙인다', () => {
    expect(tutorCacheKey('exam-saa-c03-1', BASE)).toMatch(/^exam-saa-c03-1#[0-9a-f]{12}$/);
  });

  test('같은 내용이면 같은 키다', () => {
    expect(tutorCacheKey('exam-saa-c03-1', BASE)).toBe(tutorCacheKey('exam-saa-c03-1', { ...BASE }));
  });

  test('보기 순서를 섞어 라벨이 다른 내용을 가리키면 키가 달라진다', () => {
    const shuffled = {
      ...BASE,
      choices: [
        { label: 'A', text: 'Amazon EFS' },
        { label: 'B', text: 'Amazon S3' },
      ],
      answer: 'B',
    };
    expect(tutorCacheKey('exam-saa-c03-1', shuffled)).not.toBe(tutorCacheKey('exam-saa-c03-1', BASE));
  });

  test('보기 문구만 바뀌어도 키가 달라진다', () => {
    const edited = { ...BASE, choices: [BASE.choices[0], { label: 'B', text: 'Amazon EFS One Zone' }] };
    expect(tutorCacheKey('exam-saa-c03-1', edited)).not.toBe(tutorCacheKey('exam-saa-c03-1', BASE));
  });
});
