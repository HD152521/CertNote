import { AppError } from './errors';
import { hashPassword, verifyPassword } from './passwords';
import type { UserRecord, UserRepository } from './types';

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

  async signup(email: string, password: string): Promise<UserRecord> {
    assertValidCredentials(email, password);
    const normalized = normalizeEmail(email);
    const existing = await this.users.findByEmail(normalized);
    if (existing) {
      throw new AppError(409, 'email_taken', '이미 가입된 이메일입니다.');
    }
    const passwordHash = await hashPassword(password);
    return this.users.create({ email: normalized, passwordHash });
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
}
