// 웹 푸시 도메인 타입.

// 브라우저 PushManager.subscribe()가 돌려주는 구독을 직렬화한 형태.
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// DB에 저장된 구독 1행(발송 시 web-push에 그대로 넘긴다).
export interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// 사용자별 알림 설정.
export interface NotifPrefs {
  notifyReview: boolean; // 복습 리마인더
  notifyInactive: boolean; // N일 미방문 복귀 알림
  reminderHour: number; // 발송 시각(KST, 0~23)
}

// 푸시 페이로드(서비스워커 push 핸들러와 형태 일치).
export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}
