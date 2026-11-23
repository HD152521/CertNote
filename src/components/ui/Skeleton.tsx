import { cn } from '@/lib/cn';

// 로딩 스켈레톤 조각. 장식이라 스크린리더에서 숨기고, 움직임은 reduced-motion 을 지킨다(motion-safe).
// 모서리(rounded)는 BASE 에 두지 않는다 — cn(twMerge)에서 rounded-lg 와 충돌해 사라질 수 있다.
const BASE = 'bg-bg-subtle motion-safe:animate-pulse';

export function SkeletonLine({ className }: { className?: string }) {
  return <div aria-hidden className={cn('h-4 w-full rounded', BASE, className)} />;
}

export function SkeletonCard({ className }: { className?: string }) {
  return <div aria-hidden className={cn('h-32 w-full rounded-lg border border-border', BASE, className)} />;
}
