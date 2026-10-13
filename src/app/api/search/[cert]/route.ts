import { buildSearchShard, listShardKeys } from '@/lib/search/build';

// 자격증 하나의 본문 검색 샤드. 키는 "<slug>.<내용 해시>" 이고 실제 목록으로만 열린다:
// generateStaticParams 가 유효 키만 빌드 시 생성하고 dynamicParams=false 라서 그 밖의 키(낡은 해시 포함)는
// 렌더 없이 진짜 404 다 → 임의 키로 캐시 항목을 만들 수 없다. 핸들러의 재검증은 이중 방어.
//
// URL 이 내용 해시를 품고 있으므로 브라우저가 영구 캐시(immutable)해도 안전하다 — 콘텐츠가 바뀌면(배포)
// 매니페스트가 새 해시를 가리키고 새 URL 을 받는다.
export const dynamic = 'force-static';
export const dynamicParams = false;

const SHARD_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export async function generateStaticParams() {
  return (await listShardKeys('ko')).map((cert) => ({ cert }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ cert: string }> }) {
  const { cert } = await params;
  const shard = await buildSearchShard(cert, 'ko');
  if (!shard) return new Response('Not Found', { status: 404 });
  return Response.json(shard, { headers: { 'Cache-Control': SHARD_CACHE_CONTROL } });
}
