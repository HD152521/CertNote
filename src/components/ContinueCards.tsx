'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import type { CertMeta } from '@/lib/content';
import { onProgressChange, readProgress, type ProgressEntry } from '@/lib/progress';
import { cn } from '@/lib/cn';

interface ContinueCardsProps { certs: CertMeta[]; }

interface Row { cert: CertMeta; entry: ProgressEntry; }

export function ContinueCards({ certs }: ContinueCardsProps) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    const refresh = () => {
      const prog = readProgress();
      const list: Row[] = [];
      for (const cert of certs) {
        const entry = prog[cert.slug]?.lastVisited;
        if (entry) list.push({ cert, entry });
      }
      list.sort((a, b) => b.entry.at - a.entry.at);
      setRows(list);
    };
    refresh();
    return onProgressChange(refresh);
  }, [certs]);
  if (rows === null || rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
        <Clock className="h-3.5 w-3.5" /> 이어서 읽기
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.slice(0, 4).map(({ cert, entry }) => (
          <Link
            key={cert.slug}
            href={entry.href}
            className={cn('group flex flex-col gap-1.5 rounded-lg border border-border bg-bg-elevated p-4', 'transition hover:border-border-strong')}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-fg-faint">{cert.code}</span>
              <span className="font-mono text-[11px] text-fg-faint">Week {entry.week} · Day {entry.day}</span>
            </div>
            <p className="text-sm font-medium truncate">
              {entry.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}
            </p>
            <span className="flex items-center gap-1 text-xs text-fg group-hover:text-accent transition">
              계속 <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
