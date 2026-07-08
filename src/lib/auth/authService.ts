import { AppError } from './errors';
import { hashPassword, verifyPassword } from './passwords';
import type { SignupProfile, UserRecord, UserRepository } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertValidCredentials(email: string, password: string): void {
  if (!email || !EMAIL_RE.test(email)) {
    throw new AppError(400, 'invalid_email', '올바른 이메일 형식이 아닙니다.');
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(400, 'weak_password', `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
  }
}

// 인증 핵심 로직. UserRepository 인터페이스에만 의존(DIP) → DB 구현과 분리.
export class AuthService {
  constructor(private readonly users: UserRepository) {}

  async signup(email: string, password: string, profile?: SignupProfile): Promise<UserRecord> {
    assertValidCredentials(email, password);
    const normalized = normalizeEmail(email);
    const existing = await this.users.findByEmail(normalized);
    if (existing) {
      throw new AppError(409, 'email_taken', '이미 가입된 이메일입니다.');
    }
    const passwordHash = await hashPassword(password);
    // 신규 가입자는 미인증 상태로 생성(인증 메일은 signup 라우트에서 발송).
    // 기존 사용자는 마이그레이션 DEFAULT true라 영향 없음.
    return this.users.create({ email: normalized, passwordHash, emailVerified: false, profile });
  }

  async login(email: string, password: string): Promise<UserRecord> {
    if (!email || !password) {
      throw new AppError(400, 'missing_credentials', '이메일과 비밀번호를 입력하세요.');
    }
    const user = await this.users.findByEmail(normalizeEmail(email));
    // 사용자 없음/비밀번호 불일치를 동일 메시지로 — 계정 존재 여부 노출 방지.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new AppError(401, 'invalid_credentials', '이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    return user;
  }

  // 소셜 로그인: ①이미 연결된 계정 → 그대로 로그인 ②같은 이메일의 기존 계정 → 연결 후 로그인
  // (제공자가 이메일을 검증한 경우에만 — 미검증 이메일로 남의 계정에 연결되는 탈취 방지)
  // ③둘 다 없으면 신규 생성(비밀번호는 추측 불가 무작위 — 원하면 비밀번호 재설정으로 설정).
  async oauthLogin(identity: {
    provider: string;
    sub: string;
    email: string;
    emailVerified: boolean;
    name: string | null;
  }): Promise<{ user: UserRecord; isNew: boolean }> {
    const linked = await this.users.findByOauth(identity.provider, identity.sub);
    if (linked) return { user: linked, isNew: false };
    if (!identity.emailVerified) {
      throw new AppError(401, 'oauth_email_unverified', '구글 계정의 이메일이 확인되지 않았습니다.');
    }
    const normalized = normalizeEmail(identity.email);
    if (!EMAIL_RE.test(normalized)) {
      throw new AppError(401, 'oauth_bad_email', '소셜 계정의 이메일을 확인할 수 없습니다.');
    }
    const existing = await this.users.findByEmail(normalized);
    if (existing) {
      await this.users.linkOauth(existing.id, identity.provider, identity.sub);
      return { user: existing, isNew: false };
    }
    const { randomBytes } = await import('node:crypto');
    const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
    const user = await this.users.createOauthUser({
      email: normalized,
      passwordHash,
      provider: identity.provider,
      sub: identity.sub,
      name: identity.name,
    });
    // 신규 소셜 가입자는 프로필(목표 자격증 등)이 비어 있다 — 콜백이 1회 보완 온보딩으로 보낸다.
    return { user, isNew: true };
  }
}
