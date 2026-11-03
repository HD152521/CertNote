'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { SqlConsole } from './SqlConsole';

// 퀴즈 해설 아래에 펼치는 작은 SQL 실습장. 문항의 SELECT 문을 골라 실행하고 고쳐 볼 수 있다.
export default function QuizSql({ statements }: { statements: string[] }) {
  const [pick, setPick] = useState(0);
  return (
    <div className="not-prose mt-3 space-y-2.5 rounded-lg border border-border bg-bg px-3 py-3">
      {statements.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="실행할 SQL 고르기">
          {statements.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setPick(i)}
              aria-pressed={i === pick}
              className={cn(
                'max-w-full truncate rounded border px-2 py-0.5 font-mono text-[11.5px]',
                i === pick ? 'border-fg bg-fg text-bg' : 'border-border text-fg-muted hover:text-fg',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <SqlConsole key={pick} initial={`${statements[pick]};`} rows={2} />
      <div className="text-[12px] text-fg-faint">
        EMP·DEPT·SALGRADE 예제 테이블로 실행해요. 과제로 더 연습하려면{' '}
        <Link href="/lab/sql-select-basics" className="underline underline-offset-2 hover:text-fg">
          SQL 실습장
        </Link>
        으로 가세요.
      </div>
    </div>
  );
}
