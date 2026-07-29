'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { EN_CATEGORY } from '@/lib/category';
import { cn } from '@/lib/cn';
import { isLanguageCookieAuthoritative, type Language } from '@/lib/i18n';
import { setLanguage, useLanguage } from '@/lib/i18n-client';

// 헤더 KO/EN 토글. 동작이 페이지 종류에 따라 갈린다.
//
//  - 색인 대상 공개 페이지(/, /aws/*, /linux/*, /en/*): 언어가 URL로 결정되므로 반대 언어 URL로 이동.
//    영어판은 aws 무료 Week1만 있으므로 유료 주차(week2+)나 비-aws 섹션에서 EN을 누르면 영어 허브로.
//  - 로그인 전용 페이지(대시보드 등): 대응 URL이 없으므로 lang 쿠키만 바꾸고 그 자리에 머문다.
//    예전에는 여기서 /en 홈으로 튕겨내 사용자가 보던 페이지를 잃었다.
function counterpart(pathname: string, to: Language): string {
  // ko 공개 경로는 섹션 세그먼트(/aws·/linux). 섹션을 캡처해 영어판 유무를 판정한다.
  const koMatch = pathname.match(/^\/(aws|linux)\/([^/]+)(?:\/week(\d+)\/day(\d+))?$/);
  const enMatch = pathname.match(new RegExp(`^/${EN_CATEGORY}(?:/([^/]+)(?:/week(\\d+)/day(\\d+))?)?$`));
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
