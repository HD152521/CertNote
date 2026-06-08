import { Pool, type QueryResultRow } from 'pg';

// 단일 Postgres 커넥션 풀(모듈 싱글턴). Neon 등 호스티드 Postgres 사용.
let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
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
