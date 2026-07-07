import type { MetadataRoute } from 'next';
import { DEFAULT_CATEGORY, EN_CATEGORY } from '@/lib/category';
import { getAllDays, listCerts } from '@/lib/content';
import { SITE_URL } from '@/lib/site';

// 전체 공개 페이지 지도. day 페이지는 유료(Week2+)도 포함한다 —
// 크롤러에겐 미리보기+페이월이 노출되므로 검색 랜딩으로 유효하다.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const certs = await listCerts(DEFAULT_CATEGORY);
  const out: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.6 },
  ];
  for (const cert of certs) {
    out.push({
      url: `${SITE_URL}/${DEFAULT_CATEGORY}/${cert.slug}`,
      changeFrequency: 'weekly',
      priority: 0.9,
    });
    const days = await getAllDays(DEFAULT_CATEGORY, cert.slug);
    for (const d of days) {
      out.push({
        url: `${SITE_URL}${d.href}`,
        changeFrequency: 'monthly',
        // 무료 Week1은 검색 유입의 정문이라 우선순위를 높게 준다.
        priority: d.week === 1 ? 0.8 : 0.5,
      });
    }
  }
  // 영어판(무료 Week1 트랙). 콘텐츠가 없으면 조용히 생략.
  const enCerts = await listCerts(EN_CATEGORY).catch(() => []);
  if (enCerts.length > 0) {
    out.push({ url: `${SITE_URL}/${EN_CATEGORY}`, changeFrequency: 'weekly', priority: 0.8 });
    for (const cert of enCerts) {
      out.push({ url: `${SITE_URL}/${EN_CATEGORY}/${cert.slug}`, changeFrequency: 'weekly', priority: 0.7 });
      const days = await getAllDays(EN_CATEGORY, cert.slug);
      for (const d of days) {
        out.push({ url: `${SITE_URL}${d.href}`, changeFrequency: 'monthly', priority: 0.6 });
      }
    }
  }
  return out;
}
