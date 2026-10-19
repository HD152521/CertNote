import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { hashPassword } from '@/lib/auth/passwords';
import type { AccountAuthInfo } from '@/lib/auth/account';

// 계정 삭제·비밀번호 라우트의 "계정 종류별 확인 수단" 검증.
// 계정 종류(has_password)는 DB(getAccountAuthInfo)가 정한다 — 요청 본문의 어떤 플래그도 믿지 않는지 본다.
const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getAccountAuthInfo: vi.fn(),
  deleteAccount: vi.fn(),
  changePassword: vi.fn(),
  createResetToken: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@/lib/auth/currentUser', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/auth/account', () => ({
  getAccountAuthInfo: mocks.getAccountAuthInfo,
  deleteAccount: mocks.deleteAccount,
  changePassword: mocks.changePassword,
}));
vi.mock('@/lib/auth/passwordReset', () => ({ createResetToken: mocks.createResetToken }));
vi.mock('@/lib/mail/mailer', () => ({
  appUrl: () => 'http://localhost:3000',
  getMailer: () => ({ send: mocks.send }),
}));
vi.mock('@/lib/rateLimit', () => ({ clientIp: () => '127.0.0.1', rateLimit: () => ({ ok: true, retryAfter: 0 }) }));

const { POST: deletePost } = await import('./delete/route');
const { POST: passwordPost } = await import('./password/route');
const { POST: setupPost } = await import('./password/setup/route');

const nowSec = () => Math.floor(Date.now() / 1000);
// 기본 세션은 방금(1분 전) 로그인한 것 — 구글 전용 계정 탈퇴의 "최근 로그인" 조건을 만족한다.
const SESSION = { sub: '7', email: 'me@example.com', role: 'user' as const, ver: 0, iat: 0 };
let passwordAccount: AccountAuthInfo;
let googleOnlyAccount: AccountAuthInfo;

function req(body: unknown): Request {
  return new Request('http://localhost/api/account/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-at-least-16-chars';
  passwordAccount = { email: SESSION.email, passwordHash: await hashPassword('correct-pw-1'), tokenVersion: 0, hasPassword: true };
  googleOnlyAccount = { email: SESSION.email, passwordHash: await hashPassword('random-unknown'), tokenVersion: 0, hasPassword: false };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ ...SESSION, iat: nowSec() - 60 });
  mocks.changePassword.mockResolvedValue(1);
  mocks.createResetToken.mockResolvedValue('tok');
});

describe('POST /api/account/delete — 비밀번호 계정', () => {
  beforeEach(() => mocks.getAccountAuthInfo.mockResolvedValue(passwordAccount));

  test('비밀번호 없이는 탈퇴할 수 없다(이메일 확인 입력으로도 불가)', async () => {
    const res = await deletePost(req({ confirmEmail: SESSION.email }));
    expect(res.status).toBe(400);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  test('클라이언트가 "비밀번호 없는 계정" 플래그를 보내도 우회되지 않는다', async () => {
    const res = await deletePost(
      req({ confirmEmail: SESSION.email, hasPassword: false, isGoogle: true, accountType: 'google', password: '' }),
    );
    expect(res.status).toBe(400);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  test('틀린 비밀번호는 거부', async () => {
    const res = await deletePost(req({ password: 'wrong-pw-1' }));
    expect(res.status).toBe(400);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  test('비밀번호 계정은 최근 로그인을 요구하지 않는다(오래된·iat 없는 세션도 비밀번호로 탈퇴)', async () => {
    mocks.getCurrentUser.mockResolvedValue({ sub: '7', email: SESSION.email, role: 'user', ver: 0 });
    const res = await deletePost(req({ password: 'correct-pw-1' }));
    expect(res.status).toBe(200);
  });

  test('맞는 비밀번호면 삭제하고 세션 쿠키를 지운다', async () => {
    const res = await deletePost(req({ password: 'correct-pw-1' }));
    expect(res.status).toBe(200);
    expect(mocks.deleteAccount).toHaveBeenCalledWith('7');
    expect(res.headers.get('set-cookie') ?? '').toMatch(/cn_session=;/);
  });
});

describe('POST /api/account/delete — 구글 전용(비밀번호 없는) 계정', () => {
  beforeEach(() => mocks.getAccountAuthInfo.mockResolvedValue(googleOnlyAccount));

  test('계정 이메일을 그대로 입력하면 탈퇴된다(대소문자·공백 무시)', async () => {
    const res = await deletePost(req({ confirmEmail: '  ME@Example.com ' }));
    expect(res.status).toBe(200);
    expect(mocks.deleteAccount).toHaveBeenCalledWith('7');
    expect(res.headers.get('set-cookie') ?? '').toMatch(/cn_session=;/);
  });

  test('확인 입력이 틀리거나 비면 탈퇴되지 않는다', async () => {
    for (const confirmEmail of ['other@example.com', '', undefined]) {
      const res = await deletePost(req({ confirmEmail }));
      expect(res.status).toBe(400);
    }
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  test('세션의 이메일이 아니라 DB의 이메일과 대조한다', async () => {
    mocks.getAccountAuthInfo.mockResolvedValue({ ...googleOnlyAccount, email: 'db@example.com' });
    const res = await deletePost(req({ confirmEmail: SESSION.email }));
    expect(res.status).toBe(400);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  test('최근 로그인(10분 이내) 세션만 통과 — 9분 전 OK', async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...SESSION, iat: nowSec() - 9 * 60 });
    const res = await deletePost(req({ confirmEmail: SESSION.email }));
    expect(res.status).toBe(200);
  });

  test('10분이 지난 세션은 403 reauth_required(이메일이 맞아도)', async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...SESSION, iat: nowSec() - 11 * 60 });
    const res = await deletePost(req({ confirmEmail: SESSION.email }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('reauth_required');
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  test('iat 가 없는 옛 토큰은 403 reauth_required', async () => {
    mocks.getCurrentUser.mockResolvedValue({ sub: '7', email: SESSION.email, role: 'user', ver: 0 });
    const res = await deletePost(req({ confirmEmail: SESSION.email }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('reauth_required');
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  test('비로그인은 401', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await deletePost(req({ confirmEmail: SESSION.email }));
    expect(res.status).toBe(401);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });
});

describe('POST /api/account/password — 비밀번호 변경', () => {
  test('비밀번호 계정: 현재 비밀번호가 맞으면 변경하고 새 ver 세션을 재발급한다', async () => {
    mocks.getAccountAuthInfo.mockResolvedValue(passwordAccount);
    const res = await passwordPost(req({ currentPassword: 'correct-pw-1', newPassword: 'next-pw-123' }));
    expect(res.status).toBe(200);
    expect(mocks.changePassword).toHaveBeenCalledWith('7', expect.any(String));
    expect(res.headers.get('set-cookie') ?? '').toMatch(/cn_session=ey/);
  });

  test('비밀번호 계정: 현재 비밀번호 없이는 변경 불가(플래그 우회 불가)', async () => {
    mocks.getAccountAuthInfo.mockResolvedValue(passwordAccount);
    const res = await passwordPost(req({ newPassword: 'next-pw-123', hasPassword: false }));
    expect(res.status).toBe(400);
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  test('구글 전용 계정: 현재 비밀번호 없이 바로 바꿀 수 없다 — 설정 메일로 안내', async () => {
    mocks.getAccountAuthInfo.mockResolvedValue(googleOnlyAccount);
    const res = await passwordPost(req({ newPassword: 'next-pw-123' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('password_not_set');
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  test('비밀번호를 설정한 뒤(has_password=true)에는 일반 계정처럼 변경된다', async () => {
    mocks.getAccountAuthInfo.mockResolvedValue({ ...googleOnlyAccount, passwordHash: await hashPassword('set-by-link-1'), hasPassword: true });
    const res = await passwordPost(req({ currentPassword: 'set-by-link-1', newPassword: 'next-pw-123' }));
    expect(res.status).toBe(200);
    expect(mocks.changePassword).toHaveBeenCalled();
  });
});

describe('POST /api/account/password/setup — 비밀번호 설정 메일', () => {
  test('구글 전용 계정: DB의 이메일로 설정 링크를 보낸다', async () => {
    mocks.getAccountAuthInfo.mockResolvedValue({ ...googleOnlyAccount, email: 'db@example.com' });
    const res = await setupPost(req({ email: 'attacker@example.com' }));
    expect(res.status).toBe(200);
    expect(mocks.createResetToken).toHaveBeenCalledWith('7');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0]).toBe('db@example.com');
    expect(mocks.send.mock.calls[0][2]).toContain('/reset?token=tok');
  });

  test('이미 비밀번호가 있는 계정은 409(변경 폼을 쓰라는 뜻)', async () => {
    mocks.getAccountAuthInfo.mockResolvedValue(passwordAccount);
    const res = await setupPost(req({}));
    expect(res.status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  test('비로그인은 401', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await setupPost(req({}));
    expect(res.status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
