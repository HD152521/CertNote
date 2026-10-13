import { buildSearchManifest } from '@/lib/search/build';

// 검색 매니페스트(모든 day 의 제목). 콘텐츠는 빌드 타임 자산이라 정적 캐시(1회 생성)로 충분하다.
// 본문은 /api/search/[cert] 샤드로 나눠 검색어 입력 시 받는다 → 첫 오픈 다운로드를 작게 유지.
export const dynamic = 'force-static';

export async function GET() {
  return Response.json(await buildSearchManifest('ko'));
}
