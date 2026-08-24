import { describe, expect, test } from 'vitest';
import { buildTrackContents } from './certTrack';
import { FREE_WEEK } from './entitlement/policy';

describe('buildTrackContents — 자격증 허브 트랙 구성', () => {
  test('자격증별 수치(일수·주차·문항수)를 문구에 반영한다', () => {
    const lines = buildTrackContents({ dayCount: 60, weeks: 12, mockExamCount: 68 });
    expect(lines[0]).toContain('60일');
    expect(lines[0]).toContain('12주');
    expect(lines.join(' ')).toContain('68문항');
  });

  test('모의고사가 없으면(0) 해당 줄을 생략한다 — 없는 걸 있다고 쓰지 않는다', () => {
    const lines = buildTrackContents({ dayCount: 30, weeks: 6, mockExamCount: 0 });
    expect(lines.some((l) => l.includes('모의고사'))).toBe(false);
    expect(lines).toHaveLength(3);
  });

  test('모의고사가 있으면 4줄이 된다', () => {
    expect(buildTrackContents({ dayCount: 60, weeks: 12, mockExamCount: 68 })).toHaveLength(4);
  });

  test('자격증이 다르면 문구도 달라진다(허브 간 중복 콘텐츠 방지)', () => {
    const saa = buildTrackContents({ dayCount: 60, weeks: 12, mockExamCount: 68 });
    const clf = buildTrackContents({ dayCount: 30, weeks: 6, mockExamCount: 65 });
    expect(saa[0]).not.toBe(clf[0]);
  });

  test('무료 범위는 FREE_WEEK에서 파생한다 — 숫자를 박아두면 상수가 바뀔 때 문구만 거짓이 된다', () => {
    const lines = buildTrackContents({ dayCount: 60, weeks: 12, mockExamCount: 68 });
    expect(lines[0]).toContain(`${FREE_WEEK}주차까지 무료`);
  });

  test('한국어 전용 문구라 영문 주차 표기(Week)를 섞지 않는다', () => {
    const lines = buildTrackContents({ dayCount: 60, weeks: 12, mockExamCount: 68 });
    expect(lines.join(' ')).not.toMatch(/Week/i);
  });

  test('모의고사는 Pro 전용임을 문구에 밝힌다(페이월 정직 선언)', () => {
    const lines = buildTrackContents({ dayCount: 60, weeks: 12, mockExamCount: 68 });
    const mock = lines.find((l) => l.includes('모의고사'))!;
    expect(mock).toContain('Pro 전용');
  });

  test('복습은 plan 게이팅이 없으므로 Pro 표기를 붙이지 않는다', () => {
    const lines = buildTrackContents({ dayCount: 60, weeks: 12, mockExamCount: 68 });
    const review = lines.find((l) => l.includes('오답 복습'))!;
    expect(review).not.toContain('Pro');
  });
});
