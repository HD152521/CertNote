import { EN_CATEGORY } from '@/lib/category';
import { isPaidWeek } from '@/lib/entitlement/policy';
import { isEnPresentableDay } from '@/lib/day/presentable';

// day 페이지를 검색 색인에 내보낼지의 단일 출처. generateMetadata(robots)·사이트맵·구조화 데이터·
// hreflang 짝·검색 인덱스가 전부 이 함수 하나로 판정해야 "사이트맵엔 있는데 noindex" 같은 엇갈림이 안 생긴다.
//
// 영어판은 자격증별로 "한글이 한 글자도 없는 연속 주차"까지만 색인한다(src/lib/day/presentable.ts —
// 파일에서 도출). 내비게이션 노출과 직접 접근 리다이렉트도 같은 판정을 쓰므로 색인 대상 = 보여주는 대상이다.
// 그래서 slug 가 필요하다.
export function isIndexableDay(category: string, slug: string, week: number): boolean {
  if (isPaidWeek(week)) return false;
  if (category === EN_CATEGORY) return isEnPresentableDay(slug, week);
  return true;
}
