'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { labHref } from '@/lib/labCatalogLang';
import { SqlConsole } from './SqlConsole';
import { sqlStrings, type SqlLang } from './i18n';

// 퀴즈 해설 아래에 펼치는 작은 SQL 실습장. 문항의 SELECT 문을 골라 실행하고 고쳐 볼 수 있다.
export default function QuizSql({ statements, lang = 'ko' }: { statements: string[]; lang?: SqlLang }) {
  const s = sqlStrings(lang);
  const [pick, setPick] = useState(0);
  return (
    <div className="not-prose mt-3 space-y-2.5 rounded-lg border border-border bg-bg px-3 py-3">
      {statements.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={s.pickLabel}>
          {statements.map((stmt, i) => (
            <button
              key={stmt}
              type="button"
              onClick={() => setPick(i)}
              aria-pressed={i === pick}
              className={cn(
                'max-w-full truncate rounded border px-2 py-0.5 font-mono text-[11.5px]',
                i === pick ? 'border-fg bg-fg text-bg' : 'border-border text-fg-muted hover:text-fg',
              )}
            >
              {stmt}
            </button>
          ))}
        </div>
      )}
      <SqlConsole key={pick} initial={`${statements[pick]};`} rows={2} lang={lang} />
      <div className="text-[12px] text-fg-faint">
        {s.quizRunsOn}
        {' '}
        <Link href={labHref('sql-select-basics', lang)} className="underline underline-offset-2 hover:text-fg">
          {s.quizLabLink}
        </Link>
        {s.quizLabTail}
      </div>
    </div>
  );
}
