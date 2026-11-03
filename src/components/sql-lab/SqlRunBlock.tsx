'use client';

import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';
import { Play } from 'lucide-react';

// 엔진은 버튼을 누를 때만 불러온다 — 노트 페이지의 첫 로딩에 SQL 해석기가 실리지 않게.
const SqlConsole = dynamic(() => import('./SqlConsole').then((m) => m.SqlConsole), {
  ssr: false,
  loading: () => <div className="px-1 py-2 text-[12.5px] text-fg-muted">실습장을 불러오는 중…</div>,
});

/**
 * 노트의 ```sql 코드 블록. 그대로 보여 주고, 아래 버튼을 누르면 같은 문장이 든 실습장이 열려
 * 바로 실행하고 고쳐 볼 수 있다. 결과는 실제 Oracle 과 대조한 엔진으로 계산한다.
 */
export function SqlRunBlock({ sql, children }: { sql: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sql-run-block">
      {children}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="not-prose -mt-3 mb-5 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12.5px] text-fg-muted transition hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Play className="h-3.5 w-3.5" aria-hidden /> 실습장에서 실행하고 고쳐 보기
        </button>
      ) : (
        <div className="not-prose -mt-2 mb-6 rounded-lg border border-border bg-bg px-3 py-3">
          <div className="mb-2 text-[12px] text-fg-faint">EMP·DEPT·SALGRADE 예제 테이블로 실행해요. 문장을 고쳐서 다시 실행해 보세요.</div>
          <SqlConsole initial={sql} rows={2} />
        </div>
      )}
    </div>
  );
}
