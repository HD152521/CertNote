import type { MetadataRoute } from 'next';
import { DEFAULT_CATEGORY, EN_CATEGORY } from '@/lib/category';
import { getAllDays, getCertMetaMtime, getDayMtime, listCerts } from '@/lib/content';
import { getSourceFileMtime } from '@/lib/fileMtime';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { SITE_URL } from '@/lib/site';

// 여러 파일의 lastModified 중 최댓값(가장 최근 변경)을 고른다. undefined는 무시.
// 전부 undefined면(매니페스트 부재·해당 경로 미기록) undefined를 반환한다 — docs/
// SEO-indexing-fix-plan.md Step6 후속: 예전엔 여기서 고정 폴백 날짜(FALLBACK_LASTMOD)를 냈지만,
// 그것도 "틀린 날짜를 내보낸다"는 점에서 new Date()와 같은 거짓말이다. MetadataRoute.Sitemap의
// lastModified는 선택 필드이므로, 알 수 없으면 아예 생략하는 편이 낫다(호출부가 생략 처리).
function maxMtime(dates: (Date | undefined)[]): Date | undefined {
  const valid = dates.filter((d): d is Date => d !== undefined);
  if (valid.length === 0) return undefined;
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}

// lastModified가 있을 때만 그 키를 포함한 엔트리를 만든다. undefined를 그대로 넣으면 타입은
// 통과하지만 "빈 값"이 아니라 "필드 자체가 없어야" Next가 사이트맵에서 완전히 생략한다.
function sitemapEntry(
  url: string,
  lastModified: Date | undefined,
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'],
  priority: number,
): MetadataRoute.Sitemap[number] {
  return {
    url,
    changeFrequency,
    priority,
    ...(lastModified ? { lastModified } : {}),
  };
}

// 전체 공개 페이지 지도.
// - 구글은 changeFrequency/priority를 사실상 무시하고 lastModified만 참고하므로 반드시 채운다.
// - lastModified는 실제 콘텐츠/코드 변경 시각(git 커밋 시각 기반 매니페스트)에서 도출한다 —
//   new Date()(매 빌드 갱신)와 fs.stat 파일 mtime(Vercel 체크아웃 시 빌드 시각으로 리셋됨,
//   Step6 후속 사고) 둘 다 Google이 lastmod 신호를 불신하게 만드는 안티패턴이라 쓰지 않는다.
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
    sitemapEntry(SITE_URL, homeLastMod, 'weekly', 1),
    // 카테고리 허브 = "aws 자격증 순서/종류" 착지 페이지.
    sitemapEntry(`${SITE_URL}/${DEFAULT_CATEGORY}`, categoryHubLastMod, 'weekly', 0.9),
    sitemapEntry(`${SITE_URL}/pricing`, await getSourceFileMtime('src/app/pricing/page.tsx'), 'monthly', 0.6),
    sitemapEntry(`${SITE_URL}/privacy`, await getSourceFileMtime('src/app/privacy/PrivacyContent.tsx'), 'yearly', 0.3),
  ];
  for (const cert of certs) {
    out.push(
      sitemapEntry(`${SITE_URL}/${DEFAULT_CATEGORY}/${cert.slug}`, await getCertMetaMtime(DEFAULT_CATEGORY, cert.slug), 'weekly', 0.9),
    );
    const days = await getAllDays(DEFAULT_CATEGORY, cert.slug);
    for (const d of days) {
      if (d.week > FREE_WEEK) continue; // Week2+ noindex — 색인 대상이 아니므로 제외.
      out.push(
        sitemapEntry(
          `${SITE_URL}${d.href}`,
          await getDayMtime(DEFAULT_CATEGORY, cert.slug, d.week, d.day),
          'monthly',
          0.8, // 무료 Week1은 검색 유입의 정문.
        ),
      );
    }
  }
  // 영어판(무료 Week1 트랙). 콘텐츠가 없으면 조용히 생략.
  const enCerts = await listCerts(EN_CATEGORY).catch(() => []);
  if (enCerts.length > 0) {
    const enCertMetaMtimes = await Promise.all(enCerts.map((c) => getCertMetaMtime(EN_CATEGORY, c.slug)));
    out.push(sitemapEntry(`${SITE_URL}/${EN_CATEGORY}`, maxMtime(enCertMetaMtimes), 'weekly', 0.8));
    for (const cert of enCerts) {
      out.push(sitemapEntry(`${SITE_URL}/${EN_CATEGORY}/${cert.slug}`, await getCertMetaMtime(EN_CATEGORY, cert.slug), 'weekly', 0.7));
      const days = await getAllDays(EN_CATEGORY, cert.slug);
      for (const d of days) {
        if (d.week > FREE_WEEK) continue; // 영어판도 무료 Week1만 색인.
        out.push(
          sitemapEntry(`${SITE_URL}${d.href}`, await getDayMtime(EN_CATEGORY, cert.slug, d.week, d.day), 'monthly', 0.6),
        );
      }
    }
  }
  return out;
}
