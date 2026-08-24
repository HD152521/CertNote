import { describe, expect, test } from 'vitest';
import { buildTrackContents } from './certTrack';

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
});
