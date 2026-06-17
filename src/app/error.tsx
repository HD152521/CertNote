'use client';

import { useEffect } from 'react';
import Link from 'next/link';

// 서버/클라이언트 렌더 중 예기치 못한 오류(예: DB 일시 장애)를 잡는 라우트 에러 바운더리.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 상세는 서버 로그/Vercel에 남는다. 여기선 클라이언트 콘솔에만.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-xl font-semibold">문제가 발생했어요</h1>
      <p className="text-sm text-fg-muted">
        일시적인 오류일 수 있어요. 잠시 후 다시 시도해 주세요.
        {error.digest && <span className="mt-1 block font-mono text-xs text-fg-faint">코드: {error.digest}</span>}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
        >
          다시 시도
        </button>
        <Link href="/" className="rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:border-border-strong">
          홈으로
        </Link>
      </div>
    </div>
  );
}
