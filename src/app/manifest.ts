import type { MetadataRoute } from 'next';

// PWA 매니페스트. 홈 화면 설치 시 앱 이름·아이콘·전체화면 실행 정보를 제공한다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cert Notes — AWS 자격증 출퇴근 노트',
    short_name: 'Cert Notes',
    description: 'AWS 자격증 학습 노트와 복습(SRS)을 출퇴근 시간에. 매일 복습 알림으로 꾸준히.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    lang: 'ko',
    categories: ['education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
