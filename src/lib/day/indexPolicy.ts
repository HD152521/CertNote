import { isPaidWeek } from '@/lib/entitlement/policy';

// day 페이지를 검색 색인에 내보낼지의 단일 출처. generateMetadata(robots)·사이트맵·구조화 데이터·
// hreflang 짝이 전부 이 함수 하나로 판정해야 "사이트맵엔 있는데 noindex" 같은 엇갈림이 안 생긴다.
export function isIndexableDay(category: string, week: number): boolean {
  if (isPaidWeek(week)) return false;
  return true;
}
