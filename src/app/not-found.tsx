import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '페이지를 찾을 수 없음',
  // robots를 여기서 선언하지 않는다 — global-not-found.tsx 상단 주석 참고(Step7-A-2). Next.js가
  // 404 상태코드에 <meta name="robots" content="noindex"/>를 항상 자동 주입하므로 중복 선언이면
  // robots 메타가 두 개 나간다.
};

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-xl font-semibold text-fg">페이지를 찾을 수 없습니다</h1>
      <p className="text-sm text-fg-muted">
        요청하신 페이지가 존재하지 않거나 이동되었어요.
      </p>
      <div className="flex gap-2">
        <Link href="/" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90">
          홈으로
        </Link>
        <Link href="/aws" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-fg transition hover:border-border-strong">
          AWS 자격증 목록
        </Link>
      </div>
    </div>
  );
}
