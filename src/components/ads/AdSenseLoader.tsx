'use client';

import { useSelectedLayoutSegments } from 'next/navigation';
import { isAdEligiblePath, routePathFromSegments } from '@/lib/ads/adEligibility';
import { buildAdSenseScriptSrc, getAdSenseClient } from '@/lib/ads/adsense';

// 구글 애드센스 로더(docs/P3-adsense-readiness-plan.md Step 9). 루트 레이아웃에 한 번만 둔다.
//
// next/script 대신 <script async> 를 직접 그리는 이유: 애드센스의 사이트 소유 확인은 이 스크립트
// 태그가 페이지에 있는지를 본다. next/script 의 기본 전략(afterInteractive)은 초기 HTML 에
// <link rel="preload"> 만 남기고 script 태그는 하이드레이션 뒤에 클라이언트가 붙인다 — JS 를
// 실행하지 않는 크롤러에는 태그가 보이지 않는다. beforeInteractive 는 초기 HTML 에 실리지만
// 루트 레이아웃 전용이라 경로별로 뺄 수 없다. React 19 는 async 스크립트를 <head> 로 올리고
// 같은 src 를 한 번만 싣는다.
//
// 제외 경로 판정에 cookies()/headers() 를 쓰지 않는다. 루트 레이아웃에서 요청별 API 를 부르면
// 홈·허브·day 페이지의 정적 캐시가 전부 깨진다(docs/P3-step3-speed-report.md). 이 훅은 프리렌더
// 때도 라우트 세그먼트를 돌려주므로 공개 페이지의 정적 HTML 에 스크립트가 실린다.
//
// 한계: 공개 페이지에서 클라이언트 내비게이션으로 /login 등에 들어오면 이미 실행된 스크립트는
// 남는다(문서를 새로 받지 않으므로 되돌릴 수 없다). 제외 화면에는 광고 슬롯이 없어 수동 광고는
// 뜨지 않는다. 자동 광고를 켠다면 애드센스 콘솔의 페이지 제외에도 같은 경로를 등록해야 한다.
export function AdSenseLoader() {
  const segments = useSelectedLayoutSegments();
  const client = getAdSenseClient();
  if (!client || !isAdEligiblePath(routePathFromSegments(segments))) return null;
  return <script async src={buildAdSenseScriptSrc(client)} crossOrigin="anonymous" />;
}
