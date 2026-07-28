import Link from 'next/link';
import { Lock } from 'lucide-react';
import { t, type Language } from '@/lib/i18n';
import { pick } from '@/lib/strings/dict';
import { chromeStrings } from '@/lib/strings/chrome';

interface PaywallProps {
  // 비로그인이면 로그인 유도, 로그인 무료면 업그레이드 유도로 문구를 바꾼다.
  loggedIn: boolean;
  // 서버 컴포넌트라 훅을 못 쓴다. 언어는 카테고리를 아는 페이지가 내려준다.
  lang: Language;
}

// 잠긴(유료) 콘텐츠 자리에 표시. 본문은 이 컴포넌트에 전달되지 않는다(미리보기는 페이지가 별도 렌더).
export function Paywall({ loggedIn, lang }: PaywallProps) {
  const s = pick(chromeStrings, lang);
  return (
    <div className="my-8 rounded-xl border border-border bg-bg-subtle p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Lock className="h-5 w-5" />
      </div>
      <h2 className="text-lg font-semibold">{s.paywallTitle}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">
        {s.paywallBody}
      </p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <Link
          href="/pricing"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
        >
          {s.paywallCta}
        </Link>
        {!loggedIn && (
          <Link href="/login" className="rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:border-border-strong">
            {t(lang, 'login')}
          </Link>
        )}
      </div>
    </div>
  );
}
