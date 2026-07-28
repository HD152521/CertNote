import { DEFAULT_CATEGORY } from '@/lib/category';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AppShell } from '@/components/AppShell';
import { HtmlLangSync } from '@/components/HtmlLangSync';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { PromoModal } from '@/components/PromoModal';
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
  // 네이버 서치어드바이저 권장 80자 이내(검색 스니펫 잘림 방지). og:description도 이 값을 자동 상속한다.
  description: 'AWS 자격증 독학 커리큘럼. 하루 30분 한국어 노트로 SAA·DVA·SOA 합격 준비. Week 1 무료.',
  alternates: {
    canonical: '/',
    languages: {
      'ko': '/',
      'en': '/en',
      'x-default': '/',
    },
  },
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

// 사이트 대표 구조화 데이터 — 검색엔진의 브랜드/사이트명 표시 신호. 페이지별 Course/ItemList와 별개로 전역 1회.
const siteLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
  },
];

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const certs = await listCerts(DEFAULT_CATEGORY);
  return (
    <html lang="ko" suppressHydrationWarning className={`${inter.variable} ${jbMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-fg">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteLd) }} />
        <PostHogProvider>
          <HtmlLangSync />
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <AppShell certs={certs}>{children}</AppShell>
            <PromoModal />
          </ThemeProvider>
          <ServiceWorkerRegister />
        </PostHogProvider>
      </body>
    </html>
  );
}
