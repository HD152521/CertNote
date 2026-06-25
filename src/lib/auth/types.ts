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

// 회원가입 시 함께 수집하는 프로필(테스터 데이터). 인증과 무관하므로 UserRecord와 분리.
// 이름·생년월일·목표 자격증은 필수, 나머지는 선택(null 허용).
export interface SignupProfile {
  name: string;
  birthdate: string; // 'YYYY-MM-DD'
  targetCert: string; // 자격증 slug
  occupation?: string;
  purpose?: string;
  experienceLevel?: string;
}

// 데이터 접근 추상화(DIP) — AuthService는 이 인터페이스에만 의존한다.
export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  create(input: {
    email: string;
    passwordHash: string;
    role?: Role;
    emailVerified?: boolean;
    profile?: SignupProfile;
  }): Promise<UserRecord>;
}
