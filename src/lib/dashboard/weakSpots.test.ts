import { describe, expect, test } from 'vitest';
import { mergeWeakSpots } from './weakSpots';

const domains = [
  { domain: '복원력을 갖춘 아키텍처 설계', attempts: 28, correct: 15, accuracy: 54 },
  { domain: '보안 아키텍처 설계', attempts: 30, correct: 30, accuracy: 100 },
  { domain: '비용 최적화 아키텍처 설계', attempts: 2, correct: 0, accuracy: 0 },
];
const topics = [
  { slug: 'saa-c03', code: 'SAA-C03', week: 5, attempts: 19, correct: 11, accuracy: 58 },
  { slug: 'saa-c03', code: 'SAA-C03', week: 7, attempts: 14, correct: 9, accuracy: 64 },
  { slug: 'saa-c03', code: 'SAA-C03', week: 2, attempts: 9, correct: 7, accuracy: 78 },
];

describe('mergeWeakSpots', () => {
  test('도메인과 주차를 합쳐 정답률 낮은 3개, 풀이가 적거나 다 맞힌 영역은 뺀다', () => {
    const spots = mergeWeakSpots(domains, topics);
    expect(spots.map((s) => s.key)).toEqual(['domain:복원력을 갖춘 아키텍처 설계', 'topic:saa-c03#5', 'topic:saa-c03#7']);
  });

  test('도메인은 모의고사로, 주차는 그 주의 첫 노트로 보낸다', () => {
    const [d, t] = mergeWeakSpots(domains, topics);
    expect(d.href).toBe('/exam');
    expect(t.href).toBe('/aws-certs/saa-c03/week5/day1');
  });

  test('정답률이 같으면 많이 푼 쪽이 먼저', () => {
    const same = [
      { slug: 'a', code: 'A', week: 1, attempts: 4, correct: 2, accuracy: 50 },
      { slug: 'b', code: 'B', week: 1, attempts: 10, correct: 5, accuracy: 50 },
    ];
    expect(mergeWeakSpots([], same).map((s) => s.slug)).toEqual(['b', 'a']);
  });
});
