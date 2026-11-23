import { SkeletonLine } from '@/components/ui/Skeleton';

// /notebook 화면(max-w-2xl, 머리글 + 목록 줄) 모양. 문구 없음(쿠키 언어 화면).
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10" aria-hidden>
      <div className="space-y-2">
        <SkeletonLine className="h-3 w-24" />
        <SkeletonLine className="h-8 w-1/2" />
        <SkeletonLine className="h-4 w-2/3" />
      </div>
      <div className="space-y-3">
        <SkeletonLine className="h-16" />
        <SkeletonLine className="h-16" />
        <SkeletonLine className="h-16" />
        <SkeletonLine className="h-16" />
      </div>
    </div>
  );
}
