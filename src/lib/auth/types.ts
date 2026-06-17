export type Role = 'user' | 'admin';

// DB에 저장되는 사용자 레코드(비밀번호 해시 포함 — 외부 노출 금지).
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
  emailVerified: boolean;
  tokenVersion: number;
}

// 클라이언트로 내보내도 안전한 사용자 정보.
export interface PublicUser {
  id: string;
  email: string;
  role: Role;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, role: user.role };
}

// 데이터 접근 추상화(DIP) — AuthService는 이 인터페이스에만 의존한다.
export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  create(input: { email: string; passwordHash: string; role?: Role; emailVerified?: boolean }): Promise<UserRecord>;
}
