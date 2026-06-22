// 전역 로딩 스켈레톤. 동적 페이지(특히 MDX 렌더가 무거운 day 페이지) 전환 시
// 즉시 표시돼 체감 속도를 크게 개선한다(빈 화면 대기 제거).
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse space-y-4 py-10" aria-hidden>
      <div className="h-7 w-2/3 rounded bg-bg-subtle" />
      <div className="h-4 w-1/3 rounded bg-bg-subtle" />
      <div className="mt-6 space-y-3">
        <div className="h-4 w-full rounded bg-bg-subtle" />
        <div className="h-4 w-11/12 rounded bg-bg-subtle" />
        <div className="h-4 w-5/6 rounded bg-bg-subtle" />
        <div className="h-4 w-full rounded bg-bg-subtle" />
        <div className="h-4 w-3/4 rounded bg-bg-subtle" />
      </div>
    </div>
  );
}
