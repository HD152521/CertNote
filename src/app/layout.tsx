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
import { JsonLd } from '@/components/JsonLd';
import { listCerts } from '@/lib/content';
import { buildSiteLd } from '@/lib/structuredData';
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
  // canonical/hreflang은 여기서 선언하지 않는다(docs/SEO-indexing-fix-plan.md Step 2).
  // canonical을 지정하지 않은 모든 하위 라우트가 이 값을 그대로 상속해 /checkout 같은
  // 무관한 페이지까지 홈을 자기 canonical로 선언하는 사고가 있었다. 홈의 canonical/hreflang은
  // src/app/page.tsx로 옮기고, 나머지 공개 라우트는 각자 자기참조 canonical을 명시한다.
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
// 생성 로직은 src/lib/structuredData.ts(buildSiteLd)로 단일화(Step4) — day 페이지의
// Article이 여기서 선언하는 Organization을 @id로 그대로 참조하므로 값이 한 곳에서만 나와야 한다.
const siteLd = buildSiteLd();

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const certs = await listCerts(DEFAULT_CATEGORY);
  return (
    <html lang="ko" suppressHydrationWarning className={`${inter.variable} ${jbMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-fg">
        <JsonLd data={siteLd} />
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
