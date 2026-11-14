import '../globals.css';
import { RootDocument } from '@/components/RootDocument';
import { koRootMetadata, rootViewport } from '@/lib/rootMetadata';

// 한국어 루트 레이아웃. /en/* 은 (en)/layout.tsx 가 따로 <html lang="en"> 을 서버 렌더한다
// (docs/growth/next-work-plan-2026-11-14.md Step 3). 두 루트 사이 이동은 전체 페이지 로드다.
export const metadata = koRootMetadata;
export const viewport = rootViewport;

export default function KoRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootDocument lang="ko">{children}</RootDocument>;
}
