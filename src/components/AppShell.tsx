import type { ReactNode } from 'react';
import type { CertMeta } from '@/lib/content';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { SearchProvider } from './SearchProvider';
import { buildSearchIndex, getAllDays } from '@/lib/content';

interface AppShellProps { certs: CertMeta[]; children: ReactNode; }

export async function AppShell({ certs, children }: AppShellProps) {
  const certTrees = await Promise.all(
    certs.map(async (c) => ({ meta: c, days: await getAllDays('aws-certs', c.slug) })),
  );
  const searchIndex = await buildSearchIndex('aws-certs');
  return (
    <SearchProvider index={searchIndex}>
      <div className="flex min-h-screen flex-col">
        <Header certs={certs} />
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 px-4 lg:px-6">
          <Sidebar certTrees={certTrees} />
          <main className="min-w-0 flex-1 py-6 lg:py-10 lg:pl-8">{children}</main>
        </div>
      </div>
    </SearchProvider>
  );
}
