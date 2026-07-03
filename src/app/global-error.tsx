'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// 루트 레이아웃 자체가 던진 에러를 잡는 최후 방어선. 루트 레이아웃을 대체하므로
// html/body를 직접 렌더해야 하고 globals.css도 적용되지 않는다(인라인 스타일 사용).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0f14',
          color: '#e6e8eb',
        }}
      >
        <div style={{ textAlign: 'center', padding: 24, maxWidth: 400 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>문제가 발생했어요</h1>
          <p style={{ fontSize: 14, opacity: 0.7, marginBottom: 4 }}>일시적인 오류일 수 있어요. 잠시 후 다시 시도해 주세요.</p>
          {error.digest && (
            <p style={{ fontSize: 12, opacity: 0.5, fontFamily: 'monospace', marginBottom: 16 }}>코드: {error.digest}</p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
