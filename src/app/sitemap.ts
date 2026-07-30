import type { MetadataRoute } from 'next';
import { EN_CATEGORY, SECTIONS } from '@/lib/category';
import { getAllDays, getCertMetaMtime, getDayMtime, listCerts } from '@/lib/content';
import { getRoadmapRoles } from '@/lib/roadmap';
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
  // 섹션별(공개 URL /aws·/linux) 자격증을 순회한다. 콘텐츠는 content/aws-certs/ 에 공존하지만
  // listCerts(section)이 meta.section으로 걸러 각 섹션 자격증만 반환한다. 레거시 /aws-certs/* 는
  // next.config.ts에서 301되므로 사이트맵에 절대 싣지 않는다(GSC "리다이렉트된 URL 제출" 경고 방지).
  const sections = await Promise.all(
    SECTIONS.map(async (section) => ({ section, certs: await listCerts(section).catch(() => []) })),
  );
  const allCertMetaMtimes = (
    await Promise.all(
      sections.flatMap(({ section, certs }) => certs.map((c) => getCertMetaMtime(section, c.slug))),
    )
  );
  const homeLastMod = maxMtime([await getSourceFileMtime('src/app/page.tsx'), ...allCertMetaMtimes]);

  const out: MetadataRoute.Sitemap = [
    sitemapEntry(SITE_URL, homeLastMod, 'weekly', 1),
    sitemapEntry(`${SITE_URL}/pricing`, await getSourceFileMtime('src/app/pricing/page.tsx'), 'monthly', 0.6),
    sitemapEntry(`${SITE_URL}/privacy`, await getSourceFileMtime('src/app/privacy/PrivacyContent.tsx'), 'yearly', 0.3),
  ];
  for (const { section, certs } of sections) {
    if (certs.length === 0) continue; // 콘텐츠 없는 섹션(향후 준비중)은 허브도 생략.
    // 섹션 허브 = "{section} 자격증 순서/종류" 착지 페이지. lastModified = 산하 meta.json 최신값.
    const sectionMtimes = await Promise.all(certs.map((c) => getCertMetaMtime(section, c.slug)));
    out.push(sitemapEntry(`${SITE_URL}/${section}`, maxMtime(sectionMtimes), 'weekly', 0.9));
    // 후기 페이지(/{section}/reviews[/{cert}])는 사이트맵에 싣지 않는다: sitemap은 정적 라우트라
    // 빌드 시 DB를 못 읽어 후기 유무로 게이팅할 수 없고, 무조건 싣으면 빈 페이지가 제출된다.
    // 대신 섹션 허브·cert 페이지의 내부 링크로 크롤되게 하고, 자격증별 페이지는 후기 3건 미만이면
    // noindex라 thin 색인도 방지된다.
    for (const cert of certs) {
      out.push(
        sitemapEntry(`${SITE_URL}/${section}/${cert.slug}`, await getCertMetaMtime(section, cert.slug), 'weekly', 0.9),
      );
      const days = await getAllDays(section, cert.slug);
      for (const d of days) {
        if (d.week > FREE_WEEK) continue; // Week2+ noindex — 색인 대상이 아니므로 제외.
        out.push(
          sitemapEntry(
            `${SITE_URL}${d.href}`, // d.href 는 이미 /{section}/... (getAllDays가 URL category 유지)
            await getDayMtime(section, cert.slug, d.week, d.day),
            'monthly',
            0.8, // 무료 Week1은 검색 유입의 정문.
          ),
        );
      }
    }
  }

  // 직무별 자격증 로드맵(정보 페이지). "aws 자격증 순서/추천" 검색 의도의 착지 페이지라 색인 대상.
  // lastModified 는 로드맵 데이터/페이지 소스에서 도출(둘 다 매니페스트에 없으면 생략).
  const roadmapRoles = await getRoadmapRoles().catch(() => []);
  if (roadmapRoles.length > 0) {
    const roadmapLastMod = maxMtime([
      await getSourceFileMtime('src/app/roadmap/page.tsx'),
      await getSourceFileMtime('content/roadmaps.json'),
    ]);
    out.push(sitemapEntry(`${SITE_URL}/roadmap`, roadmapLastMod, 'monthly', 0.7));
    for (const role of roadmapRoles) {
      out.push(sitemapEntry(`${SITE_URL}/roadmap/${role.slug}`, roadmapLastMod, 'monthly', 0.6));
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
