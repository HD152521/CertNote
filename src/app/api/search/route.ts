import { DEFAULT_CATEGORY } from '@/lib/category';
import { buildSearchBodyIndex } from '@/lib/content';

// 본문 포함 검색 인덱스. 콘텐츠는 빌드 타임 자산이라 정적 캐시(1회 생성)로 충분하다.
// 무거운 페이로드를 모든 페이지에 인라인하지 않고 검색창 첫 오픈 시에만 받아간다.
export const dynamic = 'force-static';

export async function GET() {
  const index = await buildSearchBodyIndex(DEFAULT_CATEGORY);
  return Response.json({ index });
}
