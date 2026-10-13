import type { Metadata } from 'next';
import { dayRouteMetadata, renderDayRoute, type DayRouteParams } from '@/lib/day/dayRoute';

interface PageProps { params: Promise<DayRouteParams>; }

// 렌더 방식: 요청 시 렌더 + 영구 캐시(generateStaticParams 가 [] — week1 만 ../week1/[day] 가 빌드 시 프리렌더).
// 이유(로컬 측정): 전량 프리렌더는 빌드 2m18s → 3m55s, .next/server/app 17,612 파일·1.9GB(day HTML 하나 약
// 450KB). 온디맨드는 빌드 시간 변화 없음, 첫 방문만 약 0.4s 렌더 후 HIT. 캐시는 배포에 묶여 새 배포마다 비워진다.
// category 는 리터럴 폴더다 — 이유와 존재 검증은 src/lib/day/dayRoute.tsx, src/proxy.ts 참고.
// PAYWALL_ENABLED=true 로 되살리려면 이 라우트들을 force-dynamic 으로 돌려야 한다(paywallStaticGuard.test.ts).
export async function generateStaticParams() {
  return [];
}

export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return dayRouteMetadata('en', await params);
}

export default async function DayPage({ params }: PageProps) {
  return renderDayRoute('en', await params);
}
