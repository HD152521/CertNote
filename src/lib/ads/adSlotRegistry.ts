// 지금 화면에 광고 슬롯이 몇 개 있는지(docs/P3-adsense-readiness-plan.md Step 10).
//
// AdSlot 이 실제로 렌더됐을 때만 자신을 등록한다. useOverlapsAd 는 이 값이 0 인 동안 스크롤·리사이즈
// 리스너를 달지 않는다 — 광고 환경변수가 없는 빌드에서는 AdSlot 이 한 번도 렌더되지 않으므로 떠 있는
// 버튼들의 동작과 비용이 광고를 넣기 전과 같다.
//
// DOM 을 훑어(querySelector) 판단하지 않는 이유: 클라이언트 내비게이션에서 경로가 바뀐 뒤 본문이
// 스트리밍으로 늦게 들어오면, 경로 변경 시점에 한 번 훑는 방식은 뒤늦게 생긴 슬롯을 놓친다.
// 등록 방식은 슬롯이 생기고 사라지는 순간을 정확히 알린다.
let mountedCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** 슬롯 하나가 화면에 붙었다. 돌려주는 함수는 떼어질 때 부른다(두 번 불러도 한 번만 센다). */
export function registerAdSlot(): () => void {
  mountedCount += 1;
  emit();
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    mountedCount -= 1;
    emit();
  };
}

export function hasMountedAdSlots(): boolean {
  return mountedCount > 0;
}

/** 슬롯이 생기거나 사라질 때 알림을 받는다. 돌려주는 함수로 구독을 끊는다. */
export function subscribeAdSlots(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
