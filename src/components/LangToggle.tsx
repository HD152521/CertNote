'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { EN_CATEGORY, isSection } from '@/lib/category';
import { hasEnglishEdition, koSectionOfEnglishSlug } from '@/lib/enEdition';
import { cn } from '@/lib/cn';
import { isLanguageCookieAuthoritative, type Language } from '@/lib/i18n';
import { setLanguage, useLanguage } from '@/lib/i18n-client';

// 헤더 KO/EN 토글. 동작이 페이지 종류에 따라 갈린다.
//
//  - 색인 대상 공개 페이지(/, /aws/*, /linux/*, /en/*): 언어가 URL로 결정되므로 반대 언어 URL로 이동.
//    영어판이 없는 자격증(예: 리눅스마스터)에서 EN을 누르면 영어 홈으로.
//  - 로그인 전용 페이지(대시보드 등): 대응 URL이 없으므로 lang 쿠키만 바꾸고 그 자리에 머문다.
//    예전에는 여기서 /en 홈으로 튕겨내 사용자가 보던 페이지를 잃었다.
function counterpart(pathname: string, to: Language): string {
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

export function LangToggle() {
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
            href={counterpart(pathname, code)}
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
