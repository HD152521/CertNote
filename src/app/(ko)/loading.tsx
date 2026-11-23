import { SkeletonLine } from '@/components/ui/Skeleton';

// 전역 로딩 스켈레톤. 동적 페이지(특히 MDX 렌더가 무거운 day 페이지) 전환 시
// 즉시 표시돼 체감 속도를 크게 개선한다(빈 화면 대기 제거).
// 폭·여백은 day 페이지 본문 열(DayView 의 mx-auto max-w-2xl, 위 여백은 AppShell main 의 py 만)과 맞춰
// 로딩→실제 전환에서 레이아웃이 튀지 않게 한다. 문구는 두지 않는다 — 이 파일은 (ko)/(en) 공유라
// 언어를 알려면 cookies()/headers() 가 필요한데, 루트 loading 의 정적/스트리밍 동작(상태코드)을 바꿀 수 있다.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl" aria-hidden>
      <SkeletonLine className="mb-4 h-4 w-1/3" />
      <SkeletonLine className="h-9 w-2/3" />
      <SkeletonLine className="mt-3 h-4 w-1/3" />
      <div className="mt-8 space-y-3">
        <SkeletonLine />
        <SkeletonLine className="w-11/12" />
        <SkeletonLine className="w-5/6" />
        <SkeletonLine />
        <SkeletonLine className="w-3/4" />
      </div>
    </div>
  );
}
