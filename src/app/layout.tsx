import { DEFAULT_CATEGORY } from '@/lib/category';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
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
// D2Coding — 코드블록의 아스키 다이어그램(─ │ ├ ▼) 정렬 때문에 self-host 한다.
//
// 이전에는 JetBrains Mono(subsets: ['latin'])를 썼는데, 다운로드되는 글리프가 라틴뿐이라
// 박스드로잉·화살표·기하도형·한글이 전부 OS 기본 고정폭으로 '글자 단위 폴백'됐다. 한 줄 안에서
// 두 폰트의 자간이 섞이니 고정폭 전제가 깨져 다이어그램 세로줄이 어긋났다(콘텐츠 실측: 다이어그램
// 코드블록 1,374개, 그중 64%가 한글 혼용). D2Coding 은 라틴·박스드로잉·한글을 1:2 폭으로 모두
// 담아 이 폴백 자체를 없앤다.
//
// 파일을 라틴/한글로 쪼갠 이유: 한글 음절 11,172자가 용량의 대부분(406KB)이다. 폰트 스택에
// 라틴을 먼저 두면 브라우저가 글리프 필요 여부로 판단해, 한글이 없는 화면(대시보드 배지 등)은
// 92KB 만 받는다. 두 파일 모두 같은 원본이라 섞여도 폭이 어긋나지 않는다.
// preload=false: 코드블록은 대개 첫 화면 밖이라 LCP 를 막지 않게 한다.
// 라이선스: SIL OFL 1.1 — src/app/fonts/LICENSE-D2Coding.txt
const d2Latin = localFont({
  src: './fonts/D2Coding-latin.woff2',
  variable: '--font-mono-d2-latin',
  display: 'swap',
  preload: false,
});
const d2Korean = localFont({
  src: './fonts/D2Coding-korean.woff2',
  variable: '--font-mono-d2-korean',
  display: 'swap',
  preload: false,
});

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
    <html lang="ko" suppressHydrationWarning className={`${inter.variable} ${d2Latin.variable} ${d2Korean.variable} h-full antialiased`}>
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
