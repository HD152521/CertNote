import { describe, expect, test } from 'vitest';
import { AuthService } from './authService';
import { AppError } from './errors';
import { hashPassword } from './passwords';
import type { SignupProfile, UserRecord, UserRepository } from './types';

// 메모리 저장소 — AuthService가 UserRepository 인터페이스에만 의존하므로 DB 없이 검증한다.
class MemoryUserRepository implements UserRepository {
  readonly rows: Array<UserRecord & { oauthProvider?: string; oauthSub?: string }> = [];
  private seq = 0;

  async findByEmail(email: string) {
    return this.rows.find((r) => r.email === email) ?? null;
  }
  async create(input: { email: string; passwordHash: string; emailVerified?: boolean; profile?: SignupProfile }) {
    const row = {
      id: String(++this.seq),
      email: input.email,
      passwordHash: input.passwordHash,
      role: 'user' as const,
      createdAt: new Date().toISOString(),
      emailVerified: input.emailVerified ?? true,
      tokenVersion: 0,
      hasPassword: true,
    };
    this.rows.push(row);
    return row;
  }
  async findByOauth(provider: string, sub: string) {
    return this.rows.find((r) => r.oauthProvider === provider && r.oauthSub === sub) ?? null;
  }
  async linkOauth(userId: string, provider: string, sub: string) {
    const row = this.rows.find((r) => r.id === userId);
    if (row) Object.assign(row, { oauthProvider: provider, oauthSub: sub, emailVerified: true });
  }
  async linkOauthResettingCredentials(userId: string, provider: string, sub: string, passwordHash: string) {
    const row = this.rows.find((r) => r.id === userId)!;
    Object.assign(row, {
      oauthProvider: provider,
      oauthSub: sub,
      emailVerified: true,
      passwordHash,
      hasPassword: false,
      tokenVersion: row.tokenVersion + 1,
    });
    return { ...row };
  }
  async createOauthUser(input: { email: string; passwordHash: string; provider: string; sub: string }) {
    const row = {
      id: String(++this.seq),
      email: input.email,
      passwordHash: input.passwordHash,
      role: 'user' as const,
      createdAt: new Date().toISOString(),
      emailVerified: true,
      tokenVersion: 0,
      hasPassword: false,
      oauthProvider: input.provider,
      oauthSub: input.sub,
    };
    this.rows.push(row);
    return row;
  }
  // 비밀번호 재설정/설정 링크 완료(passwordReset.updateUserPassword)와 같은 효과.
  async setPassword(userId: string, plain: string) {
    const row = this.rows.find((r) => r.id === userId);
    if (row) Object.assign(row, { passwordHash: await hashPassword(plain), hasPassword: true });
  }
}

const GOOGLE = { provider: 'google', sub: 'g-1', email: 'g@example.com', emailVerified: true, name: '구글' };

describe('AuthService — 구글 전용 계정(has_password=false)', () => {
  test('구글 신규 가입자는 비밀번호 없는 계정으로 만들어진다', async () => {
    const repo = new MemoryUserRepository();
    const { user, isNew } = await new AuthService(repo).oauthLogin(GOOGLE);
    expect(isNew).toBe(true);
    expect(user.hasPassword).toBe(false);
  });

  test('비밀번호가 없는 계정은 어떤 비밀번호로도 로그인되지 않는다', async () => {
    const repo = new MemoryUserRepository();
    const svc = new AuthService(repo);
    const { user } = await svc.oauthLogin(GOOGLE);
    // 저장된 해시와 같은 문자열을 넣어 봐도(해시는 비밀이 아님을 가정) 거부돼야 한다.
    await expect(svc.login(GOOGLE.email, user.passwordHash)).rejects.toMatchObject({ status: 401 });
    await expect(svc.login(GOOGLE.email, 'anything-123')).rejects.toBeInstanceOf(AppError);
  });

  test('비밀번호를 설정한 뒤에는 이메일+비밀번호 로그인이 된다', async () => {
    const repo = new MemoryUserRepository();
    const svc = new AuthService(repo);
    const { user } = await svc.oauthLogin(GOOGLE);
    await repo.setPassword(user.id, 'new-password-1');
    const logged = await svc.login(GOOGLE.email, 'new-password-1');
    expect(logged.id).toBe(user.id);
    expect(logged.hasPassword).toBe(true);
    // 설정 뒤에도 구글 로그인은 같은 계정으로 이어진다.
    const again = await svc.oauthLogin(GOOGLE);
    expect(again.user.id).toBe(user.id);
  });

  test('인증된 비밀번호 계정에 구글을 연결하면 비밀번호·세션이 그대로다', async () => {
    const repo = new MemoryUserRepository();
    const svc = new AuthService(repo);
    const signed = await svc.signup(GOOGLE.email, 'pw-12345678');
    Object.assign(repo.rows.find((r) => r.id === signed.id)!, { emailVerified: true });
    const { user, isNew } = await svc.oauthLogin(GOOGLE);
    expect(isNew).toBe(false);
    expect(user.hasPassword).toBe(true);
    expect(user.tokenVersion).toBe(0);
    expect((await svc.login(GOOGLE.email, 'pw-12345678')).id).toBe(user.id);
  });
});

describe('AuthService — 사전 탈취 차단(미인증 계정에 구글 연결)', () => {
  test('미인증 계정에 연결되면 기존 비밀번호로 로그인할 수 없고 세션 버전이 오른다', async () => {
    const repo = new MemoryUserRepository();
    const svc = new AuthService(repo);
    // 누군가 피해자 이메일로 미리 가입(미인증)해 둔 상황
    // 메모리 저장소는 같은 객체를 고쳐 쓰므로 연결 전 값을 복사해 둔다.
    const preRegistered = { ...(await svc.signup(GOOGLE.email, 'attacker-pw-1')) };
    expect(preRegistered.emailVerified).toBe(false);

    const { user, isNew } = await svc.oauthLogin(GOOGLE);
    expect(isNew).toBe(false);
    expect(user.id).toBe(preRegistered.id);
    expect(user.hasPassword).toBe(false);
    expect(user.emailVerified).toBe(true);
    // 콜백은 돌려받은 tokenVersion 으로 새 세션을 만든다 — 올라간 값이어야 기존 세션만 끊기고 새 세션은 산다.
    expect(user.tokenVersion).toBe(preRegistered.tokenVersion + 1);
    expect(user.passwordHash).not.toBe(preRegistered.passwordHash);
    await expect(svc.login(GOOGLE.email, 'attacker-pw-1')).rejects.toMatchObject({ status: 401 });
  });
});
