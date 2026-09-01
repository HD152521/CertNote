import { beforeEach, describe, expect, test, vi } from 'vitest';

// getAggregate 를 모킹해 safeAggregate 의 방어 동작만 검증한다(실제 DB 불필요).
const getAggregate = vi.hoisted(() => vi.fn());
vi.mock('./reviewsRepository', () => ({ getAggregate }));

const { safeAggregate, reviewRobots, REVIEW_INDEX_MIN } = await import('./indexPolicy');

beforeEach(() => {
  getAggregate.mockReset();
});

describe('safeAggregate — metadata 경로는 절대 던지지 않는다', () => {
  test('정상이면 집계를 그대로 돌려준다', async () => {
    getAggregate.mockResolvedValue({ count: 7, average: 4.5 });
    expect(await safeAggregate('aws', null)).toEqual({ count: 7, average: 4.5 });
  });

  // 실제로 겪은 사고: reviewsRepository 는 테이블 부재(42P01)만 삼키므로
  // `DATABASE_URL 환경변수가 설정되지 않았습니다` 가 generateMetadata 를 뚫고 올라와
  // 후기 허브 페이지 전체가 렌더되지 않았다.
  test('DATABASE_URL 미설정 같은 설정 에러에서도 0 으로 떨어진다', async () => {
    getAggregate.mockRejectedValue(new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.'));
    await expect(safeAggregate('aws', null)).resolves.toEqual({ count: 0, average: 0 });
  });

  test('커넥션 장애에서도 던지지 않는다', async () => {
    getAggregate.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    await expect(safeAggregate('aws', 'saa-c03')).resolves.toEqual({ count: 0, average: 0 });
  });

  test('실패 시 결과는 noindex 로 이어진다(모르면 색인하지 않는다)', async () => {
    getAggregate.mockRejectedValue(new Error('boom'));
    const agg = await safeAggregate('aws', null);
    expect(reviewRobots(agg.count)).toEqual({ robots: { index: false, follow: true } });
  });

  test('후기가 충분하면 색인 허용으로 이어진다', async () => {
    getAggregate.mockResolvedValue({ count: REVIEW_INDEX_MIN, average: 5 });
    const agg = await safeAggregate('aws', null);
    expect(reviewRobots(agg.count)).toEqual({});
  });
});
