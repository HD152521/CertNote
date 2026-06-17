import { query } from '../db';
import type { Role, UserRecord, UserRepository } from './types';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string;
  email_verified: boolean;
  token_version: number;
}

function mapRow(row: UserRow): UserRecord {
  return {
    id: String(row.id),
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    // 마이그레이션 이전/직후 NULL 가능성에 대비해 안전한 기본값으로 수렴(verified=true, ver=0).
    emailVerified: row.email_verified ?? true,
    tokenVersion: row.token_version ?? 0,
  };
}

// UserRepository의 Postgres 구현. 인터페이스 뒤에 있어 다른 DB로 교체 가능(DIP).
export class PgUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const rows = await query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create(input: { email: string; passwordHash: string; role?: Role; emailVerified?: boolean }): Promise<UserRecord> {
    const rows = await query<UserRow>(
      'INSERT INTO users (email, password_hash, role, email_verified) VALUES ($1, $2, $3, $4) RETURNING *',
      [input.email, input.passwordHash, input.role ?? 'user', input.emailVerified ?? true],
    );
    return mapRow(rows[0]);
  }
}
