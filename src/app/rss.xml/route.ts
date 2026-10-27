import { SECTIONS } from '@/lib/category';
import { getAllDays, getDayMtime, listCerts } from '@/lib/content';
import { isIndexableDay } from '@/lib/day/indexPolicy';
import { buildRss, sortByRecent, type RssItem } from '@/lib/rss';
import { SITE_NAME, SITE_URL } from '@/lib/site';

// /rss.xml — 한국어 학습 노트의 최근 변경 피드. 네이버 서치어드바이저 "RSS 제출"용.
// 항목은 사이트맵과 같은 기준(isIndexableDay)으로 고른다. noindex 페이지를 실으면 수집 요청과
// 색인 거부가 엇갈린다. 영어판은 네이버 대상이 아니라 싣지 않는다.
//
// 콘텐츠는 빌드 때 정해지므로 정적으로 캐시한다(ads.txt 와 같다).
export const dynamic = 'force-static';

// 전체(수백 편)를 다 실으면 피드가 커질 뿐 수집기는 최근 항목만 본다.
const RSS_ITEM_LIMIT = 50;

async function collectItems(): Promise<RssItem[]> {
  const items: RssItem[] = [];
  for (const section of SECTIONS) {
    const certs = await listCerts(section).catch(() => []);
    for (const cert of certs) {
      const days = await getAllDays(section, cert.slug);
      for (const d of days) {
        if (!isIndexableDay(section, d.week)) continue;
        items.push({
          title: `${d.title} — ${cert.code}`,
          link: `${SITE_URL}${d.href}`,
          description: `${cert.code} ${cert.name} ${d.week}주차 ${d.day}일차 학습 노트와 연습 문제`,
          pubDate: await getDayMtime(section, cert.slug, d.week, d.day),
        });
      }
    }
  }
  return sortByRecent(items).slice(0, RSS_ITEM_LIMIT);
}

export async function GET(): Promise<Response> {
  const body = buildRss({
    title: `${SITE_NAME} — AWS·리눅스마스터 자격증 학습 노트`,
    link: SITE_URL,
    description: 'AWS 자격증과 리눅스마스터를 한국어 노트와 연습 문제로 준비하는 무료 학습 사이트',
    language: 'ko',
    items: await collectItems(),
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
