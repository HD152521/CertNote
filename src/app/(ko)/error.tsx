'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { chromeStrings } from '@/lib/strings/chrome';

// 서버/클라이언트 렌더 중 예기치 못한 오류(예: DB 일시 장애)를 잡는 라우트 에러 바운더리.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const s = pick(chromeStrings, useLanguage());
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-xl font-semibold">{s.errorTitle}</h1>
      <p className="text-sm text-fg-muted">
        {s.errorBody}
        {error.digest && <span className="mt-1 block font-mono text-xs text-fg-faint">{s.errorCode}: {error.digest}</span>}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90"
        >
          {s.retry}
        </button>
        <Link href="/" className="rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:border-border-strong">
          {s.goHome}
        </Link>
      </div>
    </div>
  );
}
