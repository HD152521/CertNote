import { EN_CATEGORY } from '@/lib/category';
import type { ReactNode } from 'react';
import type { CertMeta } from '@/lib/content';
import type { Language } from '@/lib/i18n';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SearchProvider } from './SearchProvider';
import { FeedbackWidget } from './FeedbackWidget';
import { SiteFooter } from './SiteFooter';
import { getAllDays, listCerts } from '@/lib/content';
import { buildCertTree, type CertTree } from '@/lib/navTree';

interface AppShellProps { certs: CertMeta[]; lang: Language; children: ReactNode; }

// 각 자격증의 섹션으로 트리를 만든다 — day href 가 공개 URL(/aws·/linux)로 나오게(레거시
// /aws-certs 301 홉 제거). 콘텐츠는 여전히 content/aws-certs/ 에서 읽힌다(contentDirOf 매핑).
function buildKoTrees(certs: CertMeta[]): Promise<CertTree[]> {
  return Promise.all(certs.map(async (c) => buildCertTree(c, await getAllDays(c.section ?? 'aws', c.slug))));
}

export async function AppShell({ certs, lang, children }: AppShellProps) {
  // 루트 레이아웃이 언어별로 갈라져 있다((ko) = /en 밖, (en) = /en/**; 둘 사이 이동은 전체 페이지 로드).
  // 트리는 모든 페이지의 HTML 에 RSC 페이로드로 실리므로(언어당 날것 ~70KB) 그 페이지가 쓰는 언어의 트리만 보낸다.
  // SidebarNav 는 enCertTrees 가 없거나 비어 있으면 certTrees 로 폴백한다.
  let certTrees: CertTree[] = [];
  let enCertTrees: CertTree[] | undefined;
  if (lang === 'en') {
    // 영어판 트리(무료 Week1만 존재). 콘텐츠가 없으면 빈 배열 — 그때만 사이드바가 한국어 트리로 폴백하므로 한국어 트리를 싣는다.
    const enCerts = await listCerts(EN_CATEGORY).catch(() => [] as CertMeta[]);
    enCertTrees = await Promise.all(
      enCerts.map(async (c) => buildCertTree(c, await getAllDays(EN_CATEGORY, c.slug))),
    );
    if (enCertTrees.length === 0) certTrees = await buildKoTrees(certs);
  } else {
    certTrees = await buildKoTrees(certs);
  }
  // 검색 인덱스는 인라인하지 않는다 — SearchProvider가 검색창 첫 오픈 시 /api/search에서 받아온다.
  return (
    <SearchProvider>
      <div className="flex min-h-screen flex-col">
        <Header certTrees={certTrees} enCertTrees={enCertTrees} />
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 px-4 lg:px-6">
          <Sidebar certTrees={certTrees} enCertTrees={enCertTrees} />
          <main className="min-w-0 flex-1 py-6 lg:py-10 lg:pl-8">{children}</main>
        </div>
        <SiteFooter />
      </div>
      <FeedbackWidget />
    </SearchProvider>
  );
}
