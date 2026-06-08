import { AuthService } from './authService';
import { PgUserRepository } from './userRepository';

// AuthService를 실제 구현(PgUserRepository)과 조립한다.
// 라우트 핸들러는 이 팩토리만 호출하면 되고, 내부 구현은 몰라도 된다.
export function getAuthService(): AuthService {
  return new AuthService(new PgUserRepository());
}
