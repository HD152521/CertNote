// 구독 권한(entitlement) 도메인 타입.
export type Plan = 'free' | 'pro';

// DB의 users 행에서 읽어온 구독 관련 원본 값.
export interface EntitlementRecord {
  plan: Plan;
  planStatus: string | null;
  planSince: string | null;
  currentPeriodEnd: string | null; // ISO. null = 무기한(수동 부여)
}

// 만료 강등까지 반영한 "유효 권한". 게이팅 판정의 입력.
export interface Entitlement {
  plan: Plan;
  isPro: boolean;
  periodEnd: string | null;
}

// 데이터 접근 추상화(DIP) — EntitlementService는 이 인터페이스에만 의존한다.
// 결제 연동 시 이 구현 뒤에 webhook 어댑터를 붙인다.
export interface EntitlementRepository {
  getByUserId(userId: string): Promise<EntitlementRecord | null>;
  grantPro(userId: string, until: Date | null): Promise<void>;
  revoke(userId: string): Promise<void>;
}
