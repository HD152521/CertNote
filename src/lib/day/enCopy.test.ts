import { describe, expect, test } from 'vitest';
import { enAvailabilitySentence, enWeeksLabel } from './enCopy';

describe('영어 허브 문구', () => {
  test('범위 라벨', () => {
    expect(enWeeksLabel(0)).toBeNull();
    expect(enWeeksLabel(1)).toBe('Week 1');
    expect(enWeeksLabel(3)).toBe('Weeks 1–3');
  });

  test('실제 범위만 말하고 숨긴 주차를 광고하지 않는다', () => {
    expect(enAvailabilitySentence(1, 12)).toBe('Week 1 is available in English; the remaining weeks are in Korean.');
    expect(enAvailabilitySentence(3, 10)).toBe('Weeks 1–3 are available in English; the remaining weeks are in Korean.');
    expect(enAvailabilitySentence(6, 6)).toBe('The whole course (Weeks 1–6) is available in English.');
    expect(enAvailabilitySentence(0, 6)).toBe('This course is currently available in Korean only.');
  });

  test('유료 시절 문구가 없다', () => {
    for (const n of [0, 1, 3, 6]) expect(enAvailabilitySentence(n, 6)).not.toMatch(/free|paid|premium|subscri|pro\b|unlock/i);
  });
});
