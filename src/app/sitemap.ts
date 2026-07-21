import type { MetadataRoute } from 'next';
import { DEFAULT_CATEGORY, EN_CATEGORY } from '@/lib/category';
import { getAllDays, getDayMtime, listCerts } from '@/lib/content';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { SITE_URL } from '@/lib/site';

// 전체 공개 페이지 지도.
// - 구글은 changeFrequency/priority를 사실상 무시하고 lastModified만 참고하므로 반드시 채운다.
// - Week2+ day 페이지는 noindex(프리미엄)라 sitemap에서 제외한다. noindex URL을 제출하면
//   Search Console에 "제출된 URL이 noindex" 경고가 뜨고 크롤 예산을 낭비한다.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const certs = await listCerts(DEFAULT_CATEGORY);
  const now = new Date();
  const out: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];
  for (const cert of certs) {
    out.push({
      url: `${SITE_URL}/${DEFAULT_CATEGORY}/${cert.slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    });
    const days = await getAllDays(DEFAULT_CATEGORY, cert.slug);
    for (const d of days) {
      if (d.week > FREE_WEEK) continue; // Week2+ noindex — 색인 대상이 아니므로 제외.
      out.push({
        url: `${SITE_URL}${d.href}`,
        lastModified: (await getDayMtime(DEFAULT_CATEGORY, cert.slug, d.week, d.day)) ?? now,
        changeFrequency: 'monthly',
        priority: 0.8, // 무료 Week1은 검색 유입의 정문.
      });
    }
  }
  // 영어판(무료 Week1 트랙). 콘텐츠가 없으면 조용히 생략.
  const enCerts = await listCerts(EN_CATEGORY).catch(() => []);
  if (enCerts.length > 0) {
    out.push({ url: `${SITE_URL}/${EN_CATEGORY}`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 });
    for (const cert of enCerts) {
      out.push({ url: `${SITE_URL}/${EN_CATEGORY}/${cert.slug}`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 });
      const days = await getAllDays(EN_CATEGORY, cert.slug);
      for (const d of days) {
        if (d.week > FREE_WEEK) continue; // 영어판도 무료 Week1만 색인.
        out.push({
          url: `${SITE_URL}${d.href}`,
          lastModified: (await getDayMtime(EN_CATEGORY, cert.slug, d.week, d.day)) ?? now,
          changeFrequency: 'monthly',
          priority: 0.6,
        });
      }
    }
  }
  return out;
}
