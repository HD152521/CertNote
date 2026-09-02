import { Pool, type QueryResultRow } from 'pg';

// 단일 Postgres 커넥션 풀(모듈 싱글턴). Neon 등 호스티드 Postgres 사용.
let pool: Pool | null = null;

// DATABASE_URL 자체가 없는 상태. "일시적 장애"가 아니라 **구조적 부재**다(로컬 개발, DB 미구성 배포).
// 재시도해도 같은 결과이므로 읽기 경로는 이걸 빈 결과로 강등해도 안전하다. 반면 커넥션 오류는
// 재시도로 회복될 수 있으므로 절대 같이 묶으면 안 된다 — 그래서 메시지가 아니라 타입으로 구분한다.
export class MissingDatabaseConfigError extends Error {
  constructor() {
    super('DATABASE_URL 환경변수가 설정되지 않았습니다.');
    this.name = 'MissingDatabaseConfigError';
  }
}

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new MissingDatabaseConfigError();
  }
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await getPool().query<T>(text, params as unknown[]);
  return result.rows;
}
