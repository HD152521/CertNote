import { SkeletonCard, SkeletonLine } from '@/components/ui/Skeleton';

// /exam 화면(max-w-2xl, 머리글 + 설정 카드 + 목록) 모양. 쿠키 언어를 쓰는 화면이라 문구는 두지 않는다.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10" aria-hidden>
      <div className="space-y-2">
        <SkeletonLine className="h-3 w-24" />
        <SkeletonLine className="h-8 w-1/2" />
        <SkeletonLine className="h-4 w-2/3" />
      </div>
      <SkeletonCard className="h-56" />
      <div className="space-y-3">
        <SkeletonLine className="h-12" />
        <SkeletonLine className="h-12" />
        <SkeletonLine className="h-12" />
      </div>
    </div>
  );
}
