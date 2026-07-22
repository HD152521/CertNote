'use client';

import { cn } from '@/lib/cn';
import { prevDate } from '@/lib/study/streak';

interface StreakCalendarProps {
  activeDates: string[];
  frozenDate: string | null;
  today: string;
  weeks?: number;
}

// 최근 N주 활동 히트맵(경량). 학습일/프리즈일/오늘을 색으로 구분한다.
export function StreakCalendar({ activeDates, frozenDate, today, weeks = 12 }: StreakCalendarProps) {
  const total = weeks * 7;
  const active = new Set(activeDates);

  // today부터 거꾸로 total일 → 과거→오늘 순.
  const days: string[] = [];
  let cursor = today;
  for (let i = 0; i < total; i += 1) {
    days.push(cursor);
    cursor = prevDate(cursor);
  }
  days.reverse();

  const cols: string[][] = [];
  for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-0.5">
        {cols.map((col) => (
          <div key={col[0]} className="flex flex-col gap-1">
            {col.map((d) => {
              const isFrozen = d === frozenDate;
              const isActive = active.has(d);
              const isToday = d === today;
              return (
                <div
                  key={d}
                  title={d}
                  className={cn(
                    'h-3 w-3 rounded-[3px] transition-colors',
                    isFrozen ? 'bg-sky-400' : isActive ? 'bg-accent' : 'bg-fg/[0.08]',
                    isToday && 'ring-1 ring-accent ring-offset-1 ring-offset-bg-elevated',
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-fg-faint">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-accent" />학습</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-sky-400" />프리즈</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-fg/[0.08]" />미학습</span>
        <span className="ml-auto">최근 {weeks}주</span>
      </div>
    </div>
  );
}
