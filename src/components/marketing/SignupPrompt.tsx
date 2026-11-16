'use client';

import Link from 'next/link';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { track } from '@/lib/analytics';
import { useAuthState } from '@/lib/auth/useAuthState';
import { signupHref } from '@/lib/auth/signupHref';
import { useLanguage } from '@/lib/i18n-client';
import { isDismissed, notifyDismissal, recordDismissal, subscribeDismissal } from '@/lib/signupPrompt/dismissal';
import { getSignupPromptStrings } from '@/lib/strings/signupPrompt';
import { cn } from '@/lib/cn';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

// 카드가 사라질 때 포커스가 body 로 떨어지지 않게, 카드 바로 앞의 포커스 가능한 요소(퀴즈 보기·다시 풀기 등)로 옮긴다.
function focusPrecedingFocusable(card: HTMLElement): void {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !card.contains(el) && (el.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  );
  candidates[candidates.length - 1]?.focus();
}

/** 사용자 동작(문제 풀이·실습 완료) 뒤에 나타나는 자리. 화면 낭독기가 나타남을 알리도록 live region 안에 그린다. */
const LIVE_PLACEMENTS: readonly SignupPlacement[] = ['quiz_answered', 'lab_done'];

export type SignupPlacement = 'quiz_answered' | 'lab_done' | 'en_home' | 'hub';

interface SignupPromptProps {
  placement: SignupPlacement;
  /** 한 문장. 'home' 은 홈·허브 공용 문구. */
  message: 'quizAnswered' | 'labDone' | 'home';
  /** false 인 동안은 그리지 않는다(예: 문제를 풀기 전). */
  active?: boolean;
  /** 페이지 위쪽에 놓일 때: 로그인 확인 전에 자리를 비워 두어 나타날 때 레이아웃이 밀리지 않게 한다. */
  reserveSpace?: boolean;
  className?: string;
}

// 비로그인 방문자에게만 보이는 가입 권유 카드. 본문을 막지 않고, 닫을 수 있고(14일간 모든 자리에서 숨김),
// 문장 하나 + 버튼 하나다. 로그인 여부는 정적 페이지가 모르므로 마운트 뒤에 확인하고, 그전까지는 그리지 않는다
// (SSR HTML 에 /signup 링크가 실리지 않는다).
export function SignupPrompt({ placement, message, active = true, reserveSpace = false, className }: SignupPromptProps) {
  const lang = useLanguage();
  const pathname = usePathname();
  // 아직 보일 일이 없는 카드(문제를 풀기 전 등)는 로그인 조회를 시작하지 않는다.
  const auth = useAuthState(active);
  // 서버 스냅샷은 '닫힘'(그리지 않음) — 마운트 뒤 localStorage 값으로 바뀐다.
  const dismissed = useSyncExternalStore(subscribeDismissal, isDismissed, () => true);
  const viewed = useRef(false);
  const s = getSignupPromptStrings(lang);

  const visible = active && auth === 'anonymous' && !dismissed;

  useEffect(() => {
    if (!visible || viewed.current) return;
    viewed.current = true;
    track('signup_prompt_view', { placement, lang });
  }, [visible, placement, lang]);

  function dismiss(card: HTMLElement) {
    focusPrecedingFocusable(card);
    recordDismissal();
    notifyDismissal();
    track('signup_prompt_dismiss', { placement, lang });
  }

  const card = visible ? (
    <aside
      aria-label={s.region}
      data-signup-prompt={placement}
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismiss(e.currentTarget);
      }}
      className={cn(
        'not-prose flex flex-col gap-3 rounded-lg border border-border bg-bg-subtle p-4 text-sm sm:flex-row sm:items-center sm:justify-between',
        reserveSpace && 'min-h-[9.5rem] sm:min-h-[6.5rem]',
        className,
      )}
    >
      <p className="max-w-prose leading-relaxed text-fg-muted">{s[message]}</p>
      <div className="flex shrink-0 items-center gap-2">
        {/* data-signup-cta: globals.css 가 .article a(밑줄·본문 글자색)보다 우선해 버튼 글자색을 지킨다. */}
        <Link
          href={signupHref(lang, pathname)}
          rel="nofollow"
          prefetch={false}
          data-signup-cta
          onClick={() => track('signup_prompt_click', { placement, lang })}
          className="inline-flex items-center rounded-md bg-accent px-3.5 py-2 font-medium text-accent-fg no-underline transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {s.cta}
        </Link>
        <button
          type="button"
          aria-label={s.close}
          onClick={(e) => dismiss(e.currentTarget.closest('aside') as HTMLElement)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted transition hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </aside>
  ) : null;

  if (!reserveSpace) {
    // 빈 live region 이 section 의 space-y 간격을 차지하지 않게 접어 둔다.
    return (
      <div role={LIVE_PLACEMENTS.includes(placement) ? 'status' : undefined} className="empty:sr-only">
        {card}
      </div>
    );
  }
  // 로그인 확인이 끝나기 전엔 같은 높이의 빈 자리. 로그인 사용자·닫은 사용자에게는 확인 뒤에 접힌다.
  return <div className={cn(!card && auth === 'unknown' && 'min-h-[9.5rem] sm:min-h-[6.5rem]')}>{card}</div>;
}
