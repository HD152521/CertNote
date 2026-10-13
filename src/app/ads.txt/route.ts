import { buildAdsTxt, getAdSenseClient } from '@/lib/ads/adsense';

// /ads.txt — 이 사이트의 광고 지면을 팔 수 있는 판매자 선언(docs/P3-adsense-readiness-plan.md Step 9).
// 본문은 로더 스크립트와 같은 NEXT_PUBLIC_ADSENSE_CLIENT 에서 만든다. public/ads.txt 로 두지 않는
// 이유: 게시자 ID 가 두 곳에 적히면 한쪽만 바뀌어 "ads.txt 불일치" 경고가 뜬다.
//
// 값은 빌드 때 정해지므로 정적으로 캐시한다. src/proxy.ts 의 matcher 는 이 경로를 잡지 않는다.
export const dynamic = 'force-static';

const TEXT_PLAIN = { 'Content-Type': 'text/plain; charset=utf-8' };

export function GET(): Response {
  const body = buildAdsTxt(getAdSenseClient());
  // 게시자 ID 가 없으면 파일이 없는 것으로 답한다. 빈 200 은 "승인된 판매자 없음" 선언으로 읽힌다.
  if (!body) return new Response('Not Found', { status: 404, headers: TEXT_PLAIN });
  return new Response(body, { status: 200, headers: TEXT_PLAIN });
}
