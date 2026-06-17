// 경량 인메모리 슬라이딩(고정) 윈도우 레이트리밋.
//
// 한계: 단일 프로세스(웜 인스턴스) 기준이라, 서버리스 다중 인스턴스에서는 인스턴스별로 카운트된다.
// 그래도 단일 IP의 단순 브루트포스/스팸은 충분히 억제한다.
//
// 분산/엄격 제한이 필요하면 아래 RateLimiter 어댑터 seam을 통해 외부 스토어로 교체하라:
//   - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 설정 시 Upstash Ratelimit으로 교체.
//   - 교체 지점: createLimiter()가 환경변수를 보고 UpstashLimiter | MemoryLimiter를 선택하도록 한다.
// ※ Upstash 실연동은 외부 계정 + @upstash/ratelimit 패키지가 필요하므로 이번 단계에서는 하지 않는다(향후 단계).
//   현재 인터페이스(rateLimit/RateLimitResult)는 호출부 변경 없이 그대로 유지되도록 설계했다.

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number; // 초
}

// 어댑터 seam. 외부 스토어 기반 구현(UpstashLimiter 등)을 이 인터페이스로 끼워넣는다.
export interface RateLimiter {
  check(key: string, limit: number, windowMs: number): RateLimitResult;
}

interface Bucket {
  count: number;
  resetAt: number;
}

// 인메모리 고정 윈도우 구현. 만료된 버킷은 접근 시 갱신되고, 주기적 스윕으로 미접근 키 누수를 막는다.
class MemoryLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweepAt = 0;
  // 윈도우보다 자주 스윕할 필요는 없다. 최소 60초 간격으로 전체 스윕.
  private static readonly SWEEP_INTERVAL_MS = 60_000;

  // 시간 기반 결정적 스윕(이전 확률 기반 Math.random 스윕은 운 나쁘면 키가 무한정 남을 수 있었다).
  private sweep(now: number): void {
    if (now - this.lastSweepAt < MemoryLimiter.SWEEP_INTERVAL_MS) return;
    this.lastSweepAt = now;
    for (const [key, b] of this.buckets) {
      if (b.resetAt <= now) this.buckets.delete(key);
    }
  }

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    this.sweep(now);
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, retryAfter: 0 };
    }
    b.count += 1;
    if (b.count > limit) {
      return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
    }
    return { ok: true, retryAfter: 0 };
  }
}

// 단일 limiter 인스턴스(모듈 싱글턴). 향후 환경변수에 따라 구현을 바꾸려면 여기만 수정한다.
function createLimiter(): RateLimiter {
  // 예: if (process.env.UPSTASH_REDIS_REST_URL) return new UpstashLimiter(...);
  return new MemoryLimiter();
}

const limiter: RateLimiter = createLimiter();

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  return limiter.check(key, limit, windowMs);
}

// 프록시(Vercel) 뒤의 클라이언트 IP 추정.
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
