import { SkeletonCard, SkeletonLine } from '@/components/ui/Skeleton';

// /dashboard 화면(max-w-3xl, 머리글 + 연속 학습 배지 + 카드 3장) 모양. 문구 없음(쿠키 언어 화면).
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-10" aria-hidden>
      <div className="flex items-end justify-between gap-4">
        <div className="w-1/2 space-y-2">
          <SkeletonLine className="h-3 w-24" />
          <SkeletonLine className="h-8" />
        </div>
        <SkeletonLine className="h-8 w-28 rounded-full" />
      </div>
      <SkeletonCard className="h-40" />
      <SkeletonCard className="h-48" />
      <SkeletonCard className="h-40" />
    </div>
  );
}
