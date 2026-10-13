import { EN_CATEGORY } from '@/lib/category';
import type { Language } from '@/lib/i18n';

// 헤더 KO/EN 토글이 이동할 반대 언어 URL(순수 함수 — LangToggle 과 단위 테스트가 공유한다).
//
// 영어판은 aws 트랙의 "한글이 없는 앞 주차"만 보여주고, 그 한도는 자격증마다 달라 클라이언트가 알 수 없다.
// 그래서 같은 day 로 곧장 가는 건 항상 열려 있는 Week1 뿐이다. 한국어 Week2+ 에서 EN 을 누르면 같은 자격증의
// 영어 허브로 간다 — 영어 day 는 한도 밖이면 서버가 한국어로 되돌려 보내므로(307) 토글이 제자리로 튕겨 돌아오거나
// 404 가 나지 않게 허브(항상 200, 영어로 읽을 수 있는 주차만 나열)를 도착지로 고정한다.
export function counterpart(pathname: string, to: Language): string {
  // ko 공개 경로는 섹션 세그먼트(/aws·/linux). 섹션을 캡처해 영어판 유무를 판정한다.
  const koMatch = pathname.match(/^\/(aws|linux)\/([^/]+)(?:\/week(\d+)\/day(\d+))?$/);
  const enMatch = pathname.match(new RegExp(`^/${EN_CATEGORY}(?:/([^/]+)(?:/week([0-9]+)/day([0-9]+))?)?$`));
  if (to === 'en') {
    if (koMatch) {
      const [, section, slug, week, day] = koMatch;
      if (section !== 'aws') return `/${EN_CATEGORY}`; // 영어판은 aws 트랙만 존재.
      if (week && Number(week) === 1) return `/${EN_CATEGORY}/${slug}/week${week}/day${day}`;
      return `/${EN_CATEGORY}/${slug}`;
    }
    return `/${EN_CATEGORY}`;
  }
  if (enMatch) {
    const [, slug, week, day] = enMatch;
    // 영어판의 ko 짝은 항상 aws 섹션이다(en 트랙 = aws 전용).
    if (slug && week) return `/aws/${slug}/week${week}/day${day}`;
    if (slug) return `/aws/${slug}`;
  }
  return '/';
}
