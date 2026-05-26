import { Clock, BookOpen, Hash } from 'lucide-react';
import type { CertMeta } from '@/lib/content';

interface DayMetaProps {
  certMeta: CertMeta;
  week: number;
  day: number;
  readingMinutes: number;
}

export function DayMeta({ certMeta, week, day, readingMinutes }: DayMetaProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-muted">
      <span className="flex items-center gap-1.5">
        <BookOpen className="h-3.5 w-3.5" />
        <span className="font-mono">{certMeta.code}</span>
        <span>· {certMeta.level === 'professional' ? 'Pro' : 'Associate'}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Hash className="h-3.5 w-3.5" />
        <span>Week {week} · Day {day}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />
        <span>읽기 약 {readingMinutes}분</span>
      </span>
    </div>
  );
}
