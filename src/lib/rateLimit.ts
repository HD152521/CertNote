// 경량 인메모리 슬라이딩 윈도우 레이트리밋.
// 한계: 단일 프로세스(웜 인스턴스) 기준이라, 서버리스 다중 인스턴스에서는 인스턴스별로 카운트된다.
// 그래도 단일 IP의 단순 브루트포스/스팸은 충분히 억제한다. 분산 환경에서 엄격히 막으려면
// Upstash Ratelimit(@upstash/ratelimit) 등 외부 스토어 기반으로 교체할 것.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number; // 초
}

// 만료 버킷 정리(메모리 누수 방지) — 호출마다 낮은 확률로 스윕.
function maybeSweep(now: number): void {
  if (Math.random() > 0.02) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  maybeSweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

// 프록시(Vercel) 뒤의 클라이언트 IP 추정.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
