import type { Metadata } from 'next';
import { renderWeek1Route, week1RouteMetadata, week1StaticParams, type Week1RouteParams } from '@/lib/day/dayRoute';

interface PageProps { params: Promise<Week1RouteParams>; }

// week1 은 빌드 때 프리렌더한다(신규 방문자·크롤러의 진입 페이지). 2주차 이상은 ../[week]/[day] 가 첫 요청 때
// 만든다. `dynamic` 은 선언하지 않는다(auto) — force-static 이면 실수로 섞인 동적 API 를 빌드가 못 잡는다.
// 목록 밖 day 는 src/proxy.ts(contentPathExists)가 렌더 전에 404 로 막는다.
export async function generateStaticParams(): Promise<Week1RouteParams[]> {
  return week1StaticParams('linux');
}

export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return week1RouteMetadata('linux', await params);
}

export default async function Week1DayPage({ params }: PageProps) {
  return renderWeek1Route('linux', await params);
}
