import { EN_CATEGORY } from '@/lib/category';
import { isPaidWeek } from '@/lib/entitlement/policy';

// 영어판에서 번역이 끝나 색인에 내보내도 되는 마지막 주차. Week2+는 한국어가 섞인 파일이
// 많아(lang="en" 선언과 본문 언어 불일치) 구글이 색인에서 빼던 원인이었다 — 번역 전까지 noindex 유지.
export const EN_INDEXABLE_WEEK = 1;

// day 페이지를 검색 색인에 내보낼지의 단일 출처. generateMetadata(robots)·사이트맵·구조화 데이터·
// hreflang 짝이 전부 이 함수 하나로 판정해야 "사이트맵엔 있는데 noindex" 같은 엇갈림이 안 생긴다.
export function isIndexableDay(category: string, week: number): boolean {
  if (isPaidWeek(week)) return false;
  if (category === EN_CATEGORY && week > EN_INDEXABLE_WEEK) return false;
  return true;
}
