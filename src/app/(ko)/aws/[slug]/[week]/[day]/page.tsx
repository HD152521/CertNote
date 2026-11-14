import type { Metadata } from 'next';
import { dayRouteMetadata, dayStaticParams, renderDayRoute, type DayRouteParams } from '@/lib/day/dayRoute';

interface PageProps { params: Promise<DayRouteParams>; }

// 2주차 이상 day. 빌드 때는 만들지 않고 첫 요청 때 정적 생성해 배포까지 캐시한다
// (docs/P3-step1-day-cache-design.md). category 가 리터럴 폴더인 이유는 src/lib/day/dayRoute.tsx,
// 존재하지 않는 slug·day 의 404 는 src/proxy.ts 가 렌더 전에 처리한다.
// `dynamic` 은 선언하지 않는다(설계 문서 2-1). 페이월을 되살리면 dayStaticParams 가 빌드를 실패시킨다.
export async function generateStaticParams(): Promise<DayRouteParams[]> {
  return dayStaticParams();
}

export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return dayRouteMetadata('aws', await params);
}

export default async function DayPage({ params }: PageProps) {
  return renderDayRoute('aws', await params);
}
