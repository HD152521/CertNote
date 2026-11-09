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
          // Next 클라이언트가 링크를 미리 불러올 때 쓰는 RSC 요청(?_rsc=, text/x-component).
          // GSC 크롤링 통계(2026-11-07)에서 크롤링의 88% 가 '다른 파일 형식'·목적 '새로고침' 이었고 HTML 은 7% 뿐이었다.
          // 본문은 HTML 에 서버 렌더로 다 들어 있어 렌더링에 필요 없으니, 크롤링 예산을 HTML 에 쓰게 막는다.
          '/*?_rsc=',
          '/*&_rsc=',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
