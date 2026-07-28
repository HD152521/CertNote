import type { MetadataRoute } from 'next';
import { DEFAULT_CATEGORY, EN_CATEGORY } from '@/lib/category';
import { getAllDays, getCertMetaMtime, getDayMtime, listCerts } from '@/lib/content';
import { getSourceFileMtime } from '@/lib/fileMtime';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { SITE_URL } from '@/lib/site';

// lastModified를 못 구했을 때 쓰는 고정 폴백(docs/SEO-indexing-fix-plan.md Step6).
// new Date()를 쓰면 매 빌드마다 값이 바뀌어 "같은 커밋을 두 번 빌드하면 lastmod가 같아야 한다"는
// 수용 기준을 못 만족한다 — 실패 시에도 결정적인 고정값을 반환해야 한다.
const FALLBACK_LASTMOD = new Date('2025-01-01T00:00:00Z');

// 여러 파일의 mtime 중 최댓값(가장 최근 변경)을 고른다. undefined는 무시.
function maxMtime(dates: (Date | undefined)[]): Date {
  const valid = dates.filter((d): d is Date => d !== undefined);
  if (valid.length === 0) return FALLBACK_LASTMOD;
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}

// 전체 공개 페이지 지도.
// - 구글은 changeFrequency/priority를 사실상 무시하고 lastModified만 참고하므로 반드시 채운다.
// - lastModified는 실제 콘텐츠/코드 변경 시각(파일 mtime)에서 도출한다 — new Date()(매 빌드 갱신)는
//   Google이 lastmod 신호를 불신하게 만드는 대표 안티패턴이라 쓰지 않는다.
// - Week2+ day 페이지는 noindex(프리미엄)라 sitemap에서 제외한다. noindex URL을 제출하면
//   Search Console에 "제출된 URL이 noindex" 경고가 뜨고 크롤 예산을 낭비한다.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const certs = await listCerts(DEFAULT_CATEGORY);

  // 카테고리 허브(자격증 목록·순서)의 lastModified = 그 카테고리 산하 자격증 meta.json 중 최신값.
  // 자격증이 추가/개편되면(허브가 실제로 바뀌는 시점) 값이 갱신되고, 그 외엔 결정적으로 고정된다.
  const certMetaMtimes = await Promise.all(certs.map((c) => getCertMetaMtime(DEFAULT_CATEGORY, c.slug)));
  const homeLastMod = maxMtime([await getSourceFileMtime('src/app/page.tsx'), ...certMetaMtimes]);
  const categoryHubLastMod = maxMtime(certMetaMtimes);

  const out: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: homeLastMod, changeFrequency: 'weekly', priority: 1 },
    // 카테고리 허브 = "aws 자격증 순서/종류" 착지 페이지.
    { url: `${SITE_URL}/${DEFAULT_CATEGORY}`, lastModified: categoryHubLastMod, changeFrequency: 'weekly', priority: 0.9 },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: maxMtime([await getSourceFileMtime('src/app/pricing/page.tsx')]),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: maxMtime([await getSourceFileMtime('src/app/privacy/PrivacyContent.tsx')]),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
  for (const cert of certs) {
    out.push({
      url: `${SITE_URL}/${DEFAULT_CATEGORY}/${cert.slug}`,
      lastModified: maxMtime([await getCertMetaMtime(DEFAULT_CATEGORY, cert.slug)]),
      changeFrequency: 'weekly',
      priority: 0.9,
    });
    const days = await getAllDays(DEFAULT_CATEGORY, cert.slug);
    for (const d of days) {
      if (d.week > FREE_WEEK) continue; // Week2+ noindex — 색인 대상이 아니므로 제외.
      out.push({
        url: `${SITE_URL}${d.href}`,
        lastModified: maxMtime([await getDayMtime(DEFAULT_CATEGORY, cert.slug, d.week, d.day)]),
        changeFrequency: 'monthly',
        priority: 0.8, // 무료 Week1은 검색 유입의 정문.
      });
    }
  }
  // 영어판(무료 Week1 트랙). 콘텐츠가 없으면 조용히 생략.
  const enCerts = await listCerts(EN_CATEGORY).catch(() => []);
  if (enCerts.length > 0) {
    const enCertMetaMtimes = await Promise.all(enCerts.map((c) => getCertMetaMtime(EN_CATEGORY, c.slug)));
    out.push({
      url: `${SITE_URL}/${EN_CATEGORY}`,
      lastModified: maxMtime(enCertMetaMtimes),
      changeFrequency: 'weekly',
      priority: 0.8,
    });
    for (const cert of enCerts) {
      out.push({
        url: `${SITE_URL}/${EN_CATEGORY}/${cert.slug}`,
        lastModified: maxMtime([await getCertMetaMtime(EN_CATEGORY, cert.slug)]),
        changeFrequency: 'weekly',
        priority: 0.7,
      });
      const days = await getAllDays(EN_CATEGORY, cert.slug);
      for (const d of days) {
        if (d.week > FREE_WEEK) continue; // 영어판도 무료 Week1만 색인.
        out.push({
          url: `${SITE_URL}${d.href}`,
          lastModified: maxMtime([await getDayMtime(EN_CATEGORY, cert.slug, d.week, d.day)]),
          changeFrequency: 'monthly',
          priority: 0.6,
        });
      }
    }
  }
  return out;
}
