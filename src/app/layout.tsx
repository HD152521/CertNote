import { DEFAULT_CATEGORY } from '@/lib/category';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AppShell } from '@/components/AppShell';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { listCerts } from '@/lib/content';
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });
const jbMono = JetBrains_Mono({ variable: '--font-mono-jb', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    'AWS 자격증 & 클라우드 자격증으로 클라우드 네이티브 커리어 시작. AWS 11종 + 리눅스마스터 1급을 주차별 한국어 노트로. 매일 30분, 연습문제·모의고사·SRS 복습까지. Week 1 무료.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'ko_KR',
    url: '/',
  },
  twitter: { card: 'summary_large_image' },
  // 매니페스트(app/manifest.ts)는 Next가 자동 링크하지만, iOS 홈화면 설치 동작은 아래 메타가 담당.
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Cert Notes' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const certs = await listCerts(DEFAULT_CATEGORY);
  return (
    <html lang="ko" suppressHydrationWarning className={`${inter.variable} ${jbMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-fg">
        <PostHogProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <AppShell certs={certs}>{children}</AppShell>
          </ThemeProvider>
          <ServiceWorkerRegister />
        </PostHogProvider>
      </body>
    </html>
  );
}
