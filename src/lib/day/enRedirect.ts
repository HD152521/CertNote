import { EN_CATEGORY } from '@/lib/category';
import { getAllDays, getCertMeta } from '@/lib/content';
import { isEnPresentableDay } from '@/lib/day/presentable';
import { parseDaySegment } from '@/lib/day/segment';

// 파일은 있지만 한글이 남아 보여줄 수 없는 영어 day(/en/<slug>/weekN/dayM) → 같은 day 의 한국어 섹션 URL.
// 호출 전제: contentPathExists 가 이미 true 를 돌려준 경로(없는 경로는 프록시가 먼저 404 로 보낸다).
//
// 판정이 프록시에 있는 이유: root loading.tsx 때문에 페이지/라우트 안에서의 redirect()·notFound() 는 이미 200 헤더가
// 나간 뒤에 불려 200 으로 스트리밍되고, 이 day 라우트는 온디맨드 ISR 이라 그 응답이 캐시된다(src/lib/day/dayRoute.tsx).
// 렌더가 시작되기 전인 프록시에서 307 을 내면 라우트 렌더도 캐시 기록도 일어나지 않는다.
//
// 한국어 짝이 없으면(영어판에만 있는 day) 한국어 허브로, 허브 조회마저 실패하면 영어 허브로 보낸다 — 어디로 가든 200 이다.
export async function unpresentableEnDayRedirect(pathname: string): Promise<string | null> {
  const [category, slug, weekSeg, daySeg, ...rest] = pathname.split('/').filter(Boolean);
  if (category !== EN_CATEGORY || !slug || !weekSeg || !daySeg || rest.length > 0) return null;
  const week = parseDaySegment(weekSeg, 'week');
  const day = parseDaySegment(daySeg, 'day');
  if (week === null || day === null) return null;
  if (isEnPresentableDay(slug, week)) return null;

  try {
    const section = (await getCertMeta(EN_CATEGORY, slug)).section ?? 'aws';
    const koDays = await getAllDays(section, slug);
    return koDays.some((d) => d.week === week && d.day === day)
      ? `/${section}/${slug}/week${week}/day${day}`
      : `/${section}/${slug}`;
  } catch {
    return `/${EN_CATEGORY}/${slug}`;
  }
}
