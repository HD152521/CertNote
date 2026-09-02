import { beforeEach, describe, expect, test, vi } from 'vitest';

// db.query 를 모킹해 읽기 경로의 "강등 vs 전파" 분기를 검증한다(실제 DB 불필요).
const query = vi.hoisted(() => vi.fn());
class FakeMissingConfig extends Error {
  constructor() {
    super('DATABASE_URL 환경변수가 설정되지 않았습니다.');
    this.name = 'MissingDatabaseConfigError';
  }
}
vi.mock('../db', () => ({ query, MissingDatabaseConfigError: FakeMissingConfig }));

const { getAggregate, listReviews } = await import('./reviewsRepository');
const { reviewRobots, REVIEW_INDEX_MIN } = await import('./indexPolicy');

beforeEach(() => {
  query.mockReset();
});

// 구조적 부재 = 재시도해도 결과가 같다 → 빈 결과로 강등해도 안전하다.
describe('읽기 경로: 구조적 부재는 빈 결과로 강등한다', () => {
  test('DATABASE_URL 미설정', async () => {
    query.mockRejectedValue(new FakeMissingConfig());
    await expect(getAggregate('aws', null)).resolves.toEqual({ count: 0, average: 0 });
    await expect(listReviews('aws', null)).resolves.toEqual([]);
  });

  test('테이블 없음(42P01 — 마이그레이션 미실행)', async () => {
    query.mockRejectedValue(Object.assign(new Error('relation "reviews" does not exist'), { code: '42P01' }));
    await expect(getAggregate('aws', null)).resolves.toEqual({ count: 0, average: 0 });
    await expect(listReviews('aws', 'saa-c03')).resolves.toEqual([]);
  });
});

// ⚠️ 이 분기가 이 파일의 핵심이다.
//
// 한때 metadata 경로에 "무엇이든 삼키는" 래퍼가 있었다. 두 후기 라우트는 force-dynamic 이라
// 메타데이터가 요청마다 재계산되므로, 후기가 쌓여 색인된 페이지에서 커넥션이 한 번만 흔들려도
// 그 응답에 noindex 가 실려 색인이 뒤집힌다. 200+noindex 는 "색인하지 말라"는 확정 신호이고,
// 5xx 는 "지금 판단하지 말고 재크롤하라"는 신호다. 일시적 장애에서는 후자가 맞다.
describe('읽기 경로: 일시적 장애는 전파한다(5xx 유도)', () => {
  test('커넥션 거부는 던진다', async () => {
    query.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    await expect(getAggregate('aws', null)).rejects.toThrow('ECONNREFUSED');
    await expect(listReviews('aws', null)).rejects.toThrow('ECONNREFUSED');
  });

  test('구문 오류 등 그 밖의 쿼리 실패도 던진다', async () => {
    query.mockRejectedValue(Object.assign(new Error('syntax error'), { code: '42601' }));
    await expect(getAggregate('aws', null)).rejects.toThrow('syntax error');
  });
});

describe('reviewRobots — 색인 게이트', () => {
  test('기준 미만이면 noindex(follow 는 유지)', () => {
    for (const n of [0, 1, REVIEW_INDEX_MIN - 1]) {
      expect(reviewRobots(n)).toEqual({ robots: { index: false, follow: true } });
    }
  });

  test('기준 이상이면 robots 키를 넣지 않는다(상위 기본값 상속)', () => {
    for (const n of [REVIEW_INDEX_MIN, REVIEW_INDEX_MIN + 10]) {
      expect(reviewRobots(n)).toEqual({});
      expect('robots' in reviewRobots(n)).toBe(false);
    }
  });

  test('DB 부재로 0 이 되면 noindex 로 이어진다', async () => {
    query.mockRejectedValue(new FakeMissingConfig());
    const agg = await getAggregate('aws', null);
    expect(reviewRobots(agg.count)).toEqual({ robots: { index: false, follow: true } });
  });
});
