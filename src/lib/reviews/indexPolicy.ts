import type { Metadata } from 'next';

// 후기 페이지의 색인 정책 단일 출처.
//
// 후기가 거의 없는 후기 페이지는 껍데기(제목·필터·작성 유도문)만 남아 thin content가 된다.
// 그런 페이지가 색인 대상으로 제출되면 GSC '크롤링됨 - 현재 색인이 생성되지 않음'에 쌓이고,
// 사이트 전체의 품질 평가를 끌어내린다(docs/SEO-indexing-fix-plan.md 의 문제의식과 동일).
//
// 그래서 후기 수가 기준 미만이면 noindex 하되 **페이지 자체는 정상 노출**한다 — 방문자는 보고
// 작성할 수 있어야 후기가 쌓인다. follow 는 유지해 하위 링크의 크롤 경로를 끊지 않는다.
//
// ⚠️ 자격증별 페이지(/{section}/reviews/{cert})와 섹션 허브(/{section}/reviews)가 **같은 기준**을
// 써야 한다. 예전에는 자격증별 페이지에만 게이트가 있고 허브에는 없어서, 후기 0건인 허브가
// 색인 대상으로 남아 있었다(사이드바에서 링크되므로 크롤은 계속 됐다).
export const REVIEW_INDEX_MIN = 3;

/**
 * 후기 수에 따른 robots 메타 조각.
 *
 * 기준 이상이면 빈 객체를 돌려준다 — `robots` 키를 아예 넣지 않아야 상위 기본값(색인 허용)이
 * 그대로 적용된다. `{ index: true }` 를 명시하면 의미는 같지만 불필요한 선언이 늘어난다.
 */
export function reviewRobots(count: number): Pick<Metadata, 'robots'> | Record<string, never> {
  return count < REVIEW_INDEX_MIN ? { robots: { index: false, follow: true } } : {};
}
