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
          '/monitoring',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
