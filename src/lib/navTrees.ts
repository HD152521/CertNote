import { EN_CATEGORY } from '@/lib/category';
import { getAllDays, getPresentableDays, listCerts } from '@/lib/content';
import type { CertMeta, DayRef } from '@/lib/content';

export interface NavTree { meta: CertMeta; days: DayRef[]; }

// 사이드바·모바일 드로어가 쓰는 자격증 트리의 단일 빌더(AppShell 이 호출).
// 한국어는 섹션별 URL(/aws·/linux) 전체 day, 영어는 보여줄 수 있는 주차까지만 — 한글이 남은 영어 day 로 가는
// 링크는 트리에 아예 없다(직접 접근은 프록시가 한국어로 보낸다: src/lib/day/enRedirect.ts).
export async function buildNavTrees(certs: CertMeta[]): Promise<{ certTrees: NavTree[]; enCertTrees: NavTree[] }> {
  // 각 자격증의 섹션으로 트리를 만든다 — day href 가 공개 URL(/aws·/linux)로 나오게(레거시
  // /aws-certs 301 홉 제거). 콘텐츠는 여전히 content/aws-certs/ 에서 읽힌다(contentDirOf 매핑).
  const certTrees = await Promise.all(
    certs.map(async (c) => ({ meta: c, days: await getAllDays(c.section ?? 'aws', c.slug) })),
  );
  // 영어판 콘텐츠가 없으면 빈 배열 — 사이드바는 한국어 트리로 폴백.
  const enCerts = await listCerts(EN_CATEGORY).catch(() => [] as CertMeta[]);
  const enCertTrees = await Promise.all(
    enCerts.map(async (c) => ({ meta: c, days: await getPresentableDays(EN_CATEGORY, c.slug) })),
  );
  return { certTrees, enCertTrees };
}
