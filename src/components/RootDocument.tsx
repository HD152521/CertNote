import type { ReactNode } from 'react';
import { preconnect } from 'react-dom';
import { DEFAULT_CATEGORY } from '@/lib/category';
import type { Language } from '@/lib/i18n';
import type { CertMeta } from '@/lib/content';
import { listCerts } from '@/lib/content';
import { d2Korean, d2Latin, inter } from '@/lib/rootFonts';
import { buildSiteLd } from '@/lib/structuredData';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AppShell } from '@/components/AppShell';
import { HtmlLangSync } from '@/components/HtmlLangSync';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { AdSenseLoader } from '@/components/ads/AdSenseLoader';
import { JsonLd } from '@/components/JsonLd';

// 사이트 대표 구조화 데이터 — 검색엔진의 브랜드/사이트명 표시 신호. 페이지별 Course/ItemList와 별개로 전역 1회.
// 생성 로직은 src/lib/structuredData.ts(buildSiteLd)로 단일화(Step4) — day 페이지의
// Article이 여기서 선언하는 Organization을 @id로 그대로 참조하므로 값이 한 곳에서만 나와야 한다.
const siteLd = buildSiteLd();

interface RootHtmlProps {
  lang: Language;
  certs: CertMeta[];
  children: ReactNode;
}

// <html>~<body> 뼈대. 동기 컴포넌트라 단위 시험이 렌더 결과(<html lang>)를 직접 검사한다.
//
// lang 은 레이아웃이 속한 라우트 그룹이 정한다 — (ko)/layout.tsx 는 'ko', (en)/layout.tsx 는 'en'.
// 요청 헤더·쿠키·pathname 을 읽지 않으므로 페이지는 정적 생성/ISR 그대로다. 클라이언트에서는
// HtmlLangSync 가 쿠키로 언어가 결정되는 로그인 전용 화면(ko 그룹)의 언어까지 보정한다.
export function RootHtml({ lang, certs, children }: RootHtmlProps) {
  return (
    <html lang={lang} suppressHydrationWarning className={`${inter.variable} ${d2Latin.variable} ${d2Korean.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-fg">
        <JsonLd data={siteLd} />
        {/* 공개 페이지에만 실린다. 게시자 ID 가 없으면 아무것도 그리지 않는다(AdSenseLoader 주석 참고). */}
        <AdSenseLoader />
        <PostHogProvider>
          <HtmlLangSync />
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <AppShell certs={certs}>{children}</AppShell>
          </ThemeProvider>
          <ServiceWorkerRegister />
        </PostHogProvider>
      </body>
    </html>
  );
}

export async function RootDocument({ lang, children }: { lang: Language; children: ReactNode }) {
  // 본문 글꼴(Pretendard, globals.css @font-face)의 CDN. CSS 를 받은 뒤에야 글꼴 요청이 시작되므로
  // 연결(DNS·TLS)만 미리 열어 둔다. 글꼴 요청은 CORS 모드라 crossOrigin 을 맞춰야 같은 연결이 재사용된다.
  // 요청 정보를 읽지 않는 리소스 힌트라 정적 캐시에 영향이 없다.
  preconnect('https://cdn.jsdelivr.net', { crossOrigin: 'anonymous' });
  const certs = await listCerts(DEFAULT_CATEGORY);
  return (
    <RootHtml lang={lang} certs={certs}>
      {children}
    </RootHtml>
  );
}
