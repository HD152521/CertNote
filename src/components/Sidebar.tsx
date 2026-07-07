import { cn } from '@/lib/cn';
import { SidebarNav, type CertTree } from './SidebarNav';

interface SidebarProps { certTrees: CertTree[]; enCertTrees?: CertTree[]; }

// 데스크탑(lg+) 고정 사이드바. 트리 렌더링은 SidebarNav에 위임(모바일 드로어와 공유).
export function Sidebar({ certTrees, enCertTrees }: SidebarProps) {
  return (
    <aside className={cn('hidden lg:block w-64 shrink-0 py-8 pr-6', 'sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto')}>
      <SidebarNav certTrees={certTrees} enCertTrees={enCertTrees} />
    </aside>
  );
}
