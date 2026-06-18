import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AppShell } from '@/components/AppShell';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { listCerts } from '@/lib/content';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' });
const jbMono = JetBrains_Mono({ variable: '--font-mono-jb', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: 'Cert Notes — AWS 자격증 출퇴근 노트',
  description: '5개 AWS 자격증 학습 자료를 매일 출퇴근 시간에 읽기 위한 도큐먼트 사이트.',
  // 매니페스트(app/manifest.ts)는 Next가 자동 링크하지만, iOS 홈화면 설치 동작은 아래 메타가 담당.
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Cert Notes' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const certs = await listCerts('aws-certs');
  return (
    <html lang="ko" suppressHydrationWarning className={`${inter.variable} ${jbMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg text-fg">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppShell certs={certs}>{children}</AppShell>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
