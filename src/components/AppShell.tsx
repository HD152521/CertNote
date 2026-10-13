import type { ReactNode } from 'react';
import type { CertMeta } from '@/lib/content';
import { buildNavTrees } from '@/lib/navTrees';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SearchProvider } from './SearchProvider';
import { FeedbackWidget } from './FeedbackWidget';
import { SiteFooter } from './SiteFooter';

interface AppShellProps { certs: CertMeta[]; children: ReactNode; }

export async function AppShell({ certs, children }: AppShellProps) {
  const { certTrees, enCertTrees } = await buildNavTrees(certs);
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
