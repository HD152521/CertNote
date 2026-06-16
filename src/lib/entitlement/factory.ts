import { PgEntitlementRepository } from './entitlementRepository';
import { EntitlementService } from './entitlementService';

// 저장소는 무상태라 싱글톤으로 재사용한다(다른 도메인 factory와 동일 패턴).
let repo: PgEntitlementRepository | null = null;

export function getEntitlementRepository(): PgEntitlementRepository {
  if (!repo) repo = new PgEntitlementRepository();
  return repo;
}

export function getEntitlementService(): EntitlementService {
  return new EntitlementService(getEntitlementRepository());
}
