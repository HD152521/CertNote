import { EN_CATEGORY } from '@/lib/category';
import type { ReactNode } from 'react';
import type { CertMeta } from '@/lib/content';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SearchProvider } from './SearchProvider';
import { FeedbackWidget } from './FeedbackWidget';
import { getAllDays, listCerts } from '@/lib/content';

interface AppShellProps { certs: CertMeta[]; children: ReactNode; }

export async function AppShell({ certs, children }: AppShellProps) {
  // 각 자격증의 섹션으로 트리를 만든다 — day href 가 공개 URL(/aws·/linux)로 나오게(레거시
  // /aws-certs 301 홉 제거). 콘텐츠는 여전히 content/aws-certs/ 에서 읽힌다(contentDirOf 매핑).
  const certTrees = await Promise.all(
    certs.map(async (c) => ({ meta: c, days: await getAllDays(c.section ?? 'aws', c.slug) })),
  );
  // 영어판 트리(무료 Week1만 존재). 콘텐츠가 없으면 빈 배열 — 사이드바는 한국어 트리로 폴백.
  const enCerts = await listCerts(EN_CATEGORY).catch(() => [] as CertMeta[]);
  const enCertTrees = await Promise.all(
    enCerts.map(async (c) => ({ meta: c, days: await getAllDays(EN_CATEGORY, c.slug) })),
  );
  // 검색 인덱스는 인라인하지 않는다 — SearchProvider가 검색창 첫 오픈 시 /api/search에서 받아온다.
  return (
    <SearchProvider>
      <div className="flex min-h-screen flex-col">
        <Header certTrees={certTrees} enCertTrees={enCertTrees} />
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 px-4 lg:px-6">
          <Sidebar certTrees={certTrees} enCertTrees={enCertTrees} />
          <main className="min-w-0 flex-1 py-6 lg:py-10 lg:pl-8">{children}</main>
        </div>
      </div>
      <FeedbackWidget />
    </SearchProvider>
  );
}
