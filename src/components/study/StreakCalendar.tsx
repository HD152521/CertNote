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
// 날짜 계산은 순수 헬퍼(prevDate) 재사용 — 서버가 넘긴 today 기준이라 TZ 안전.
export function StreakCalendar({ activeDates, frozenDate, today, weeks = 12 }: StreakCalendarProps) {
  const total = weeks * 7;
  const active = new Set(activeDates);

  // today부터 거꾸로 total일 → 과거→오늘 순으로 뒤집는다.
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
      <div className="flex gap-[3px] overflow-x-auto">
        {cols.map((col) => (
          <div key={col[0]} className="flex flex-col gap-[3px]">
            {col.map((d) => {
              const isFrozen = d === frozenDate;
              const isActive = active.has(d);
              const isToday = d === today;
              return (
                <div
                  key={d}
                  title={d}
                  className={cn(
                    'h-2.5 w-2.5 rounded-[2px]',
                    isFrozen ? 'bg-sky-400' : isActive ? 'bg-accent' : 'bg-bg-subtle',
                    isToday && 'ring-1 ring-accent ring-offset-1 ring-offset-bg-elevated',
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-2.5 text-[10px] text-fg-faint">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-[2px] bg-accent" />학습</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-[2px] bg-sky-400" />프리즈</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-[2px] bg-bg-subtle" />미학습</span>
      </div>
    </div>
  );
}
