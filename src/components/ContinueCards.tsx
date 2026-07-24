'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Clock, Sparkles } from 'lucide-react';
import type { CertMeta } from '@/lib/content';
import type { StarterDay } from '@/lib/study/starter';
import { onProgressChange, readProgress, type ProgressEntry } from '@/lib/progress';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/lib/i18n-client';
import { pick } from '@/lib/strings/dict';
import { chromeStrings } from '@/lib/strings/chrome';

interface ContinueCardsProps {
  certs: CertMeta[];
  // 읽던 기록이 없는 신규 유저에게 보여줄 목표 자격증 첫 페이지(서버에서 주입).
  starter?: StarterDay | null;
}

interface Row { cert: CertMeta; entry: ProgressEntry; }

export function ContinueCards({ certs, starter }: ContinueCardsProps) {
  const s = pick(chromeStrings, useLanguage());
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
  if (rows === null) return null;
  // 읽던 기록이 없으면(신규/기기 변경) 목표 자격증 첫 페이지를 시작점으로 제시.
  if (rows.length === 0) {
    if (!starter) return null;
    return (
      <section className="space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
          <Sparkles className="h-3.5 w-3.5" /> {s.startHere}
        </h2>
        <Link
          href={starter.href}
          className={cn('group flex flex-col gap-1.5 rounded-lg border border-accent/40 bg-bg-elevated p-4', 'transition hover:border-accent')}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-fg-faint">{starter.certCode}</span>
            <span className="font-mono text-[11px] text-fg-faint">Week 1 · Day 1</span>
          </div>
          <p className="text-sm font-medium truncate">
            {starter.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}
          </p>
          <span className="flex items-center gap-1 text-xs text-fg group-hover:text-accent transition">
            {s.startFirstPage} <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
        <Clock className="h-3.5 w-3.5" /> {s.continueReading}
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
              {s.continueCta} <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
