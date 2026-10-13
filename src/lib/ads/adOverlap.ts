// 떠 있는 버튼과 광고의 겹침 판정(docs/P3-adsense-readiness-plan.md Step 10).
//
// 애드센스 정책은 누르는 요소를 광고 위나 바로 옆에 두는 것을 금한다(오클릭 유도). 본문 흐름 안의
// 요소는 배치로 떼어 놓았지만, 화면에 고정된 버튼(모바일 이전/다음 화살표, 피드백 버튼)은 스크롤에 따라
// 광고 위로 올라온다. 이 파일은 "지금 겹치는가"를 좌표만으로 답하는 순수 함수이고, DOM 을 읽어
// 구독하는 쪽은 useOverlapsAd 다.

/** 뷰포트 기준 사각형. DOMRect 와 필드가 같아 getBoundingClientRect() 결과를 그대로 넘길 수 있다. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function isEmpty(box: Box): boolean {
  return box.right <= box.left || box.bottom <= box.top;
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * 대상 사각형 중 하나라도 광고와 겹치거나 `margin` px 안에 붙어 있는가.
 * 크기가 0 인 광고(접힌 슬롯 — display:none)는 화면에 없으므로 무시한다.
 */
export function overlapsAnyAd(targets: readonly Box[], ads: readonly Box[], margin: number): boolean {
  const visibleAds = ads.filter((ad) => !isEmpty(ad));
  return targets.some((target) => {
    const reach: Box = {
      left: target.left - margin,
      top: target.top - margin,
      right: target.right + margin,
      bottom: target.bottom + margin,
    };
    return visibleAds.some((ad) => intersects(reach, ad));
  });
}
