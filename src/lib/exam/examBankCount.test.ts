import { describe, expect, test } from 'vitest';
import { getMockExamQuestionCount } from './examBankCount';
import { getExamCertSlugs, getExamQuestionsByCert } from './examBank';

// 자격증 허브 '트랙 구성'의 모의고사 문항 수 — 원본(content/exams)만 읽는 경량 로더.

describe('getMockExamQuestionCount', () => {
  test('빌드된 전량 인덱스(exam-questions.json)와 자격증별 개수가 일치한다', () => {
    const slugs = getExamCertSlugs();
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      // 경량 로더가 인덱스를 대신할 수 있다는 근거 — 어긋나면 표기 수치가 거짓이 된다.
      expect(getMockExamQuestionCount(slug)).toBe(getExamQuestionsByCert(slug).length);
    }
  });

  test('saa-c03는 문항을 보유한다(트랙 구성 줄이 실제로 렌더되는 조건)', () => {
    expect(getMockExamQuestionCount('saa-c03')).toBeGreaterThan(0);
  });

  test('은행이 없는 자격증은 0을 반환한다(해당 줄 미표기)', () => {
    expect(getMockExamQuestionCount('no-such-cert')).toBe(0);
  });

  test('경로 조작 slug는 파일을 읽지 않고 0을 반환한다', () => {
    expect(getMockExamQuestionCount('../exam-info/saa-c03')).toBe(0);
    expect(getMockExamQuestionCount('SAA_C03')).toBe(0);
  });
});
