import type { Metadata } from 'next';
import { week1RouteMetadata, renderWeek1Route, week1StaticParams, type Week1RouteParams } from '@/lib/day/dayRoute';

interface PageProps { params: Promise<Week1RouteParams>; }

// week1 은 빌드 시 프리렌더(진입 페이지의 콜드 렌더 제거). week2+ 는 ../[week]/[day] 가 요청 시 렌더 후 캐시한다.
// `dynamic` 은 선언하지 않는다(auto) — generateStaticParams 가 있어 SSG 되며, force-static 을 명시하면 실수로
// 섞인 동적 API 를 빌드가 못 잡는다. 목록 밖 day 는 src/proxy.ts(contentPathExists)가 렌더 전에 404 로 막는다.
export async function generateStaticParams() {
  return week1StaticParams('linux');
}

export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return week1RouteMetadata('linux', await params);
}

export default async function Week1DayPage({ params }: PageProps) {
  return renderWeek1Route('linux', await params);
}
