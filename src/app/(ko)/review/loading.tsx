import { SkeletonCard, SkeletonLine } from '@/components/ui/Skeleton';

// /review 화면(max-w-2xl, 머리글 + 카드 목록) 모양. 문구 없음(쿠키 언어 화면).
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10" aria-hidden>
      <div className="space-y-1">
        <SkeletonLine className="h-8 w-1/2" />
        <SkeletonLine className="h-5 w-2/3" />
      </div>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
