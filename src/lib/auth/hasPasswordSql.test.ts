import { beforeEach, describe, expect, test, vi } from 'vitest';

// has_password 플래그가 "비밀번호가 실제로 정해지는 지점"에서만 바뀌는지 SQL 수준으로 확인한다.
const query = vi.hoisted(() => vi.fn());
vi.mock('../db', () => ({ query }));

const { updateUserPassword } = await import('./passwordReset');
const { changePassword, getAccountAuthInfo } = await import('./account');
const { PgUserRepository } = await import('./userRepository');

beforeEach(() => {
  query.mockReset();
});

describe('has_password 갱신 지점', () => {
  test('재설정/설정 링크 완료 시 has_password=true + token_version 증가', async () => {
    query.mockResolvedValue([]);
    await updateUserPassword('7', 'hash');
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toMatch(/has_password\s*=\s*true/);
    expect(sql).toMatch(/token_version\s*=\s*token_version\s*\+\s*1/);
  });

  test('마이페이지 비밀번호 변경도 has_password=true 를 유지한다', async () => {
    query.mockResolvedValue([{ token_version: 3 }]);
    expect(await changePassword('7', 'hash')).toBe(3);
    expect(String(query.mock.calls[0][0])).toMatch(/has_password\s*=\s*true/);
  });

  test('구글 신규 가입은 has_password=false 로 넣는다', async () => {
    query.mockResolvedValue([
      { id: 1, email: 'g@example.com', password_hash: 'x', role: 'user', created_at: '', email_verified: true, token_version: 0, has_password: false },
    ]);
    const user = await new PgUserRepository().createOauthUser({ email: 'g@example.com', passwordHash: 'x', provider: 'google', sub: 's', name: null });
    expect(String(query.mock.calls[0][0])).toMatch(/has_password/);
    expect(query.mock.calls[0][1]).toContain(false);
    expect(user.hasPassword).toBe(false);
  });

  test('미인증 계정 연결은 해시 교체 + has_password=false + token_version 증가를 한 UPDATE 로', async () => {
    query.mockResolvedValue([
      { id: 3, email: 'v@example.com', password_hash: 'new', role: 'user', created_at: '', email_verified: true, token_version: 4, has_password: false },
    ]);
    const user = await new PgUserRepository().linkOauthResettingCredentials('3', 'google', 's', 'new');
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toMatch(/password_hash\s*=\s*\$4/);
    expect(sql).toMatch(/has_password\s*=\s*false/);
    expect(sql).toMatch(/token_version\s*=\s*token_version\s*\+\s*1/);
    expect(sql).toMatch(/RETURNING \*/);
    expect(user.tokenVersion).toBe(4);
  });

  test('has_password 값이 비어 있으면 비밀번호 계정으로 취급 — 확인 수단이 약해지는 쪽으로 기울지 않는다', async () => {
    query.mockResolvedValue([{ email: 'a@example.com', password_hash: 'h', token_version: 0 }]);
    const info = await getAccountAuthInfo('7');
    expect(info).toEqual({ email: 'a@example.com', passwordHash: 'h', tokenVersion: 0, hasPassword: true });
  });
});
