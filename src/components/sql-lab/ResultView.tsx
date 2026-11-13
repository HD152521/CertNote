'use client';

import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { WireResult as StatementResult } from './sqlWorker';
import { display } from '@/lib/sql-lab/values';
import { localizeEngineText, localizeHint, sqlStrings, type SqlLang } from './i18n';

/** 행이 너무 많으면 화면이 길어지므로 잘라 보인다(예제 테이블은 많아야 수십 행). */
const MAX_ROWS = 200;

// 실행 결과 하나: 결과표 · ORA 오류 · 실습장 안내 중 하나.
export function ResultView({ result, showSql, lang = 'ko' }: { result: StatementResult; showSql?: boolean; lang?: SqlLang }) {
  const hint = localizeHint(lang, result.kind === 'error' ? result.hint : undefined);
  return (
    <div className="space-y-1.5">
      {showSql && <div className="truncate font-mono text-[11.5px] text-fg-faint">SQL&gt; {result.sql.replace(/\s+/g, ' ')}</div>}
      {result.kind === 'rows' && <RowsTable result={result} lang={lang} />}
      {result.kind === 'error' && (
        <div role="alert" className="rounded-md border border-[#f87171]/40 bg-[#f87171]/[0.07] px-3 py-2">
          <div className="flex items-start gap-2 font-mono text-[12.5px] text-[#dc2626] dark:text-[#fca5a5]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="break-words">
              {result.code}: {localizeEngineText(lang, result.message)}
            </span>
          </div>
          {hint && <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{hint}</p>}
        </div>
      )}
      {result.kind === 'message' && <div className="font-mono text-[12.5px] text-fg-muted">{localizeEngineText(lang, result.message)}</div>}
      {result.kind === 'note' && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-[13px] leading-relaxed text-fg-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{localizeEngineText(lang, result.message)}</span>
        </div>
      )}
    </div>
  );
}

function RowsTable({ result, lang }: { result: Extract<StatementResult, { kind: 'rows' }>; lang: SqlLang }) {
  const s = sqlStrings(lang);
  if (result.rows.length === 0) {
    return <div className="font-mono text-[12.5px] text-fg-muted">{s.noRows}</div>;
  }
  const rows = result.rows.slice(0, MAX_ROWS);
  return (
    <div>
      <div className="max-h-[22rem] overflow-auto rounded-md border border-border">
        <table className="sql-result w-full border-collapse font-mono text-[12.5px]">
          <thead className="sticky top-0 bg-bg-elevated">
            <tr>
              {result.columns.map((c, i) => (
                <th
                  key={`${c}-${i}`}
                  scope="col"
                  className={cn('whitespace-nowrap border-b border-border px-2.5 py-1.5 font-semibold text-fg', result.numeric[i] ? 'text-right' : 'text-left')}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="odd:bg-transparent even:bg-bg-elevated/60">
                {row.map((v, i) => (
                  <td key={i} className={cn('whitespace-pre px-2.5 py-1 text-fg', result.numeric[i] && 'text-right')}>
                    {v === null ? <span className="text-[11px] italic text-fg-faint">NULL</span> : display(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-[11.5px] text-fg-faint">
        {s.rowCount(result.rows.length, rows.length, MAX_ROWS)}
      </div>
    </div>
  );
}
