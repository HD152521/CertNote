import Link from 'next/link';
import { Lock } from 'lucide-react';

interface PaywallProps {
  // 비로그인이면 로그인 유도, 로그인 무료면 업그레이드 유도로 문구를 바꾼다.
  loggedIn: boolean;
}

// 잠긴(유료) 콘텐츠 자리에 표시. 본문은 이 컴포넌트에 전달되지 않는다(미리보기는 페이지가 별도 렌더).
export function Paywall({ loggedIn }: PaywallProps) {
  return (
    <div className="my-8 rounded-xl border border-border bg-bg-subtle p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Lock className="h-5 w-5" />
      </div>
      <h2 className="text-lg font-semibold">여기부터는 Pro 전용입니다</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">
        Week 1은 누구나 무료로 볼 수 있어요. Week 2부터의 전체 학습 자료와 모의고사·무제한 복습은 Pro 플랜에서 이용할 수 있습니다.
      </p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <Link
          href="/pricing"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
        >
          Pro 알아보기
        </Link>
        {!loggedIn && (
          <Link href="/login" className="rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:border-border-strong">
            로그인
          </Link>
        )}
      </div>
    </div>
  );
}
