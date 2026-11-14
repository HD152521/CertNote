import '../globals.css';
import { RootDocument } from '@/components/RootDocument';
import { enRootMetadata, rootViewport } from '@/lib/rootMetadata';

// 영어 루트 레이아웃 — /en/** 전용. 서버가 처음부터 <html lang="en"> 을 내보낸다.
export const metadata = enRootMetadata;
export const viewport = rootViewport;

export default function EnRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <RootDocument lang="en">{children}</RootDocument>;
}
