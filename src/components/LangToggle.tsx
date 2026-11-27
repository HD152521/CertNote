'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { EN_CATEGORY, isSection } from '@/lib/category';
import { enInfoPathOf, hasEnglishEdition, koInfoPathOf, koSectionOfEnglishSlug } from '@/lib/enEdition';
import { cn } from '@/lib/cn';
import { isLanguageCookieAuthoritative, type Language } from '@/lib/i18n';
import { setLanguage, useLanguage } from '@/lib/i18n-client';

// 헤더 KO/EN 토글. 동작이 페이지 종류에 따라 갈린다.
//
//  - 색인 대상 공개 페이지(/, /aws/*, /linux/*, /en/*, 정보 페이지 /about·/roadmap·/changelog·/contact·/terms·/privacy): 언어가 URL로 결정되므로 반대 언어 URL로 이동.
//    영어판이 없는 자격증(예: 리눅스마스터)에서 EN을 누르면 영어 홈으로.
//  - 로그인 전용 페이지(대시보드 등): 대응 URL이 없으므로 lang 쿠키만 바꾸고 그 자리에 머문다.
//    예전에는 여기서 /en 홈으로 튕겨내 사용자가 보던 페이지를 잃었다.
function counterpart(pathname: string, to: Language, certFilter: string | null): string {
  // 정보 페이지(소개·로드맵·수정 기록·문의·약관·개인정보처리방침)는 한국어 ↔ 영어판이 1:1 짝이다.
  const infoTarget = to === 'en' ? enInfoPathOf(pathname) : koInfoPathOf(pathname);
  if (infoTarget) return infoTarget;
  // 후기: 한국어 /aws/reviews 와 영어 /en/reviews 가 짝이다(영어판은 AWS 후기만 보여 준다).
  // 자격증 필터는 경로가 아니라 ?cert= 쿼리라(후기 통합, 2026-11-27) 그대로 들고 넘어간다.
  if (to === 'en' && pathname === '/aws/reviews') return certFilter ? `/${EN_CATEGORY}/reviews?cert=${certFilter}` : `/${EN_CATEGORY}/reviews`;
  if (to === 'ko' && pathname === `/${EN_CATEGORY}/reviews`) return certFilter ? `/aws/reviews?cert=${certFilter}` : '/aws/reviews';
  // ko 공개 경로는 섹션 세그먼트(/aws·/linux). 섹션을 캡처해 영어판 유무를 판정한다.
  const koMatch = pathname.match(/^\/(aws|linux|data)\/([^/]+)(?:\/week(\d+)\/day(\d+))?$/);
  const enMatch = pathname.match(new RegExp(`^/${EN_CATEGORY}(?:/([^/]+)(?:/week(\\d+)/day(\\d+))?)?$`));
  if (to === 'en') {
    if (koMatch) {
      const [, section, slug, week, day] = koMatch;
      if (!isSection(section) || !hasEnglishEdition(section, slug)) return `/${EN_CATEGORY}`;
      if (week) return `/${EN_CATEGORY}/${slug}/week${week}/day${day}`;
      return `/${EN_CATEGORY}/${slug}`;
    }
    return `/${EN_CATEGORY}`;
  }
  if (enMatch) {
    const [, slug, week, day] = enMatch;
    if (slug && week) return `/${koSectionOfEnglishSlug(slug)}/${slug}/week${week}/day${day}`;
    if (slug) return `/${koSectionOfEnglishSlug(slug)}/${slug}`;
  }
  return '/';
}

const BASE_ITEM = 'px-2 py-1 transition';

function itemClass(active: boolean, side: 'l' | 'r'): string {
  return cn(
    BASE_ITEM,
    side === 'l' ? 'rounded-l-[5px]' : 'rounded-r-[5px]',
    active ? 'bg-bg-subtle text-fg font-semibold' : 'text-fg-faint hover:text-fg',
  );
}

// certFilter는 /aws/reviews↔/en/reviews 전환에서만 쓰인다(후기 필터, 2026-11-27). 그 값을 읽는
// useSearchParams()는 정적 페이지에서 Suspense 경계가 필요해(Next.js 빌드 요구사항) 토글 자체를
// 감싸지 않고, 그 값에 의존하는 부분만 내부 컴포넌트로 분리했다 — 나머지 페이지에서는 폴백과
// 실제 렌더 결과가 같아(certFilter=null) 깜빡임이 없다.
function LangToggleButtons({ certFilter }: { certFilter: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const lang = useLanguage();
  const byCookie = isLanguageCookieAuthoritative(pathname);

  function choose(to: Language) {
    setLanguage(to);
    // 서버 컴포넌트가 새 x-language 헤더로 다시 렌더되게 한다.
    router.refresh();
  }

  return (
    <div className="flex items-center rounded-md border border-border text-[11px] font-mono" aria-label="Language">
      {(['ko', 'en'] as const).map((code, i) => {
        const active = lang === code;
        const label = code.toUpperCase();
        const side = i === 0 ? 'l' : 'r';
        return byCookie ? (
          <button
            key={code}
            type="button"
            onClick={() => choose(code)}
            className={itemClass(active, side)}
            aria-current={active ? 'true' : undefined}
          >
            {label}
          </button>
        ) : (
          <Link
            key={code}
            href={counterpart(pathname, code, certFilter)}
            onClick={() => setLanguage(code)}
            className={itemClass(active, side)}
            aria-current={active ? 'true' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

function LangToggleWithSearchParams() {
  const searchParams = useSearchParams();
  return <LangToggleButtons certFilter={searchParams.get('cert')} />;
}

export function LangToggle() {
  return (
    <Suspense fallback={<LangToggleButtons certFilter={null} />}>
      <LangToggleWithSearchParams />
    </Suspense>
  );
}
