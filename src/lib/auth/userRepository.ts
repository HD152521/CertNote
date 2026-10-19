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
  has_password: boolean;
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
    // 값이 비면 비밀번호 계정으로 본다 — 모르면 확인을 더 엄격하게(비밀번호 요구) 하는 쪽으로.
    hasPassword: row.has_password ?? true,
  };
}

// UserRepository의 Postgres 구현. 인터페이스 뒤에 있어 다른 DB로 교체 가능(DIP).
export class PgUserRepository implements UserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const rows = await query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create(input: {
    email: string;
    passwordHash: string;
    role?: Role;
    emailVerified?: boolean;
    profile?: import('./types').SignupProfile;
  }): Promise<UserRecord> {
    const p = input.profile;
    const rows = await query<UserRow>(
      `INSERT INTO users
         (email, password_hash, role, email_verified, name, birthdate, occupation, target_cert, purpose, experience_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        input.email,
        input.passwordHash,
        input.role ?? 'user',
        input.emailVerified ?? true,
        p?.name ?? null,
        p?.birthdate ?? null,
        p?.occupation ?? null,
        p?.targetCert ?? null,
        p?.purpose ?? null,
        p?.experienceLevel ?? null,
      ],
    );
    return mapRow(rows[0]);
  }

  async findByOauth(provider: string, sub: string): Promise<UserRecord | null> {
    const rows = await query<UserRow>(
      'SELECT * FROM users WHERE oauth_provider = $1 AND oauth_sub = $2',
      [provider, sub],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  // 기존(비밀번호 가입) 계정에 소셜 계정을 연결. 제공자가 이메일을 검증했으므로
  // email_verified도 함께 true로 승격한다.
  async linkOauth(userId: string, provider: string, sub: string): Promise<void> {
    await query(
      'UPDATE users SET oauth_provider = $2, oauth_sub = $3, email_verified = true WHERE id = $1',
      [userId, provider, sub],
    );
  }

  // 미인증 계정에 소셜 계정을 연결하면서 기존 자격 증명을 끊는다(사전 탈취 차단 — AuthService.oauthLogin 주석).
  async linkOauthResettingCredentials(userId: string, provider: string, sub: string, passwordHash: string): Promise<UserRecord> {
    const rows = await query<UserRow>(
      `UPDATE users
          SET oauth_provider = $2, oauth_sub = $3, email_verified = true,
              password_hash = $4, has_password = false, token_version = token_version + 1
        WHERE id = $1
        RETURNING *`,
      [userId, provider, sub, passwordHash],
    );
    return mapRow(rows[0]);
  }

  // 소셜 신규 가입. password_hash는 NOT NULL이라 추측 불가능한 무작위 해시를 넣고,
  // has_password=false 로 "비밀번호 없는 계정"임을 기록한다(로그인 거부·탈퇴 확인 수단 판정에 쓰임).
  // 비밀번호는 설정 메일(/api/account/password/setup)이나 '비밀번호 재설정'으로 직접 정할 수 있다.
  async createOauthUser(input: {
    email: string;
    passwordHash: string;
    provider: string;
    sub: string;
    name: string | null;
  }): Promise<UserRecord> {
    const rows = await query<UserRow>(
      `INSERT INTO users (email, password_hash, email_verified, name, oauth_provider, oauth_sub, has_password)
       VALUES ($1, $2, true, $3, $4, $5, $6) RETURNING *`,
      [input.email, input.passwordHash, input.name, input.provider, input.sub, false],
    );
    return mapRow(rows[0]);
  }
}
