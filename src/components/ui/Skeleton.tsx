import { cn } from '@/lib/cn';

// 로딩 스켈레톤 조각. 장식이라 스크린리더에서 숨기고, 움직임은 reduced-motion 을 지킨다(motion-safe).
const BASE = 'rounded bg-bg-subtle motion-safe:animate-pulse';

export function SkeletonLine({ className }: { className?: string }) {
  return <div aria-hidden className={cn('h-4 w-full', BASE, className)} />;
}

export function SkeletonCard({ className }: { className?: string }) {
  return <div aria-hidden className={cn('h-32 w-full rounded-lg border border-border', BASE, className)} />;
}
