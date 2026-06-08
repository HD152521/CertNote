import { query } from '../db';
import type { Role, UserRecord, UserRepository } from './types';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string;
}

function mapRow(row: UserRow): UserRecord {
  return {
    id: String(row.id),
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
  };
}

// UserRepository의 Postgres 구현. 인터페이스 뒤에 있어 다른 DB로 교체 가능(DIP).
export class PgUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const rows = await query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create(input: { email: string; passwordHash: string; role?: Role }): Promise<UserRecord> {
    const rows = await query<UserRow>(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING *',
      [input.email, input.passwordHash, input.role ?? 'user'],
    );
    return mapRow(rows[0]);
  }
}
