import posthog from 'posthog-js';

type TrackProps = Record<string, string | number | boolean | null | undefined>;

// 커스텀 이벤트 캡처. PostHog 미초기화(개발 환경/키 미설정) 시 완전 no-op이라
// 호출부에서 환경 분기 없이 안전하게 쓸 수 있다. 초기화는 PostHogProvider가 담당.
export function track(event: string, properties?: TrackProps): void {
  if (typeof window === 'undefined' || !posthog.__loaded) return;
  posthog.capture(event, properties);
}
