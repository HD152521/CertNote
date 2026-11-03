'use client';

import { Table2 } from 'lucide-react';
import { sampleDatabase, VISIBLE_TABLES } from '@/lib/sql-lab/data';

// 예제 테이블 안내: 열 이름·자료형과 한 줄 설명. 접어 둘 수 있게 details 를 쓴다.
export function SchemaPanel({ open = false }: { open?: boolean }) {
  const db = sampleDatabase();
  return (
    <details open={open} className="group rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-fg">
        <Table2 className="h-3.5 w-3.5" aria-hidden />
        예제 테이블 보기: EMP · DEPT · SALGRADE
        <span className="ml-auto text-[11.5px] font-normal text-fg-faint group-open:hidden">펼치기</span>
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {VISIBLE_TABLES.map((name) => {
          const t = db[name];
          return (
            <div key={name} className="min-w-0">
              <div className="font-mono text-[12.5px] font-semibold text-fg">
                {t.name} <span className="font-normal text-fg-faint">· {t.rows.length}행</span>
              </div>
              <ul className="mt-1 space-y-0.5 font-mono text-[11.5px] text-fg-muted">
                {t.columns.map((c) => (
                  <li key={c.name} className="flex justify-between gap-2">
                    <span className="text-fg">{c.name}</span>
                    <span className="truncate">{c.spec}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[12px] leading-snug text-fg-muted">{t.note}</p>
            </div>
          );
        })}
      </div>
    </details>
  );
}
