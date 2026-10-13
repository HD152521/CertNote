import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// 크롤러 안내: 콘텐츠(자격증 허브·day 페이지)는 전부 허용, 개인화·관리 영역은 차단.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/account',
          '/dashboard',
          '/review',
          '/notebook',
          '/exam',
          '/login',
          '/signup',
          '/forgot',
          '/reset',
          '/verify',
          '/welcome',
          // 구독제 보류 동안 홈으로 리다이렉트되는 화면과 로그인 뒤에만 쓰는 화면.
          '/pricing',
          '/checkout',
          '/onboarding',
          '/home',
          '/monitoring',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
