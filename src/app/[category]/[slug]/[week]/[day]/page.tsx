import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { getAllDayParams, getDay } from '@/lib/content';
import { buildToc } from '@/lib/toc';
import { readingTimeMinutes } from '@/lib/readingTime';
import { Article } from '@/components/Article';
import { Toc } from '@/components/Toc';
import { MarkAsRead } from '@/components/MarkAsRead';
import { DayMeta } from '@/components/DayMeta';
import { cn } from '@/lib/cn';

interface PageProps { params: Promise<{ category: string; slug: string; week: string; day: string }>; }

export async function generateStaticParams() {
  const params = await getAllDayParams('aws-certs');
  return params.map((p) => ({ category: 'aws-certs', ...p }));
}

function parseSegment(seg: string, prefix: string): number | null {
  if (!seg.startsWith(prefix)) return null;
  const n = Number.parseInt(seg.slice(prefix.length), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function DayPage({ params }: PageProps) {
  const { category, slug, week, day } = await params;
  if (category !== 'aws-certs') notFound();
  const w = parseSegment(week, 'week');
  const d = parseSegment(day, 'day');
  if (w === null || d === null) notFound();
  const content = await getDay(category, slug, w, d);
  if (!content) notFound();
  const toc = buildToc(content.body);
  const readingMinutes = readingTimeMinutes(content.body);
  return (
    <div className="flex gap-0">
      <MarkAsRead slug={slug} week={w} day={d} title={content.title} href={content.href} />
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-2xl">
          <nav className="mb-4 flex items-center gap-2 text-xs text-fg-muted font-mono">
            <Link href={`/${category}/${slug}`} className="hover:text-fg">← {content.certMeta.code}</Link>
            <span className="text-fg-faint">/</span>
            <span>Week {w}</span>
            <span className="text-fg-faint">/</span>
            <span className="text-fg">Day {d}</span>
          </nav>
          <DayMeta certMeta={content.certMeta} week={w} day={d} readingMinutes={readingMinutes} />
          <Article source={content.body} slug={slug} week={w} day={d} />
          <footer className="mt-12 grid grid-cols-2 gap-3 border-t border-border pt-6">
            {content.prev ? (
              <Link href={content.prev.href} className={cn('flex flex-col gap-1 rounded-md border border-border p-3 transition', 'hover:border-border-strong')}>
                <span className="flex items-center gap-1 text-xs text-fg-muted"><ArrowLeft className="h-3 w-3" /> 이전</span>
                <span className="text-sm font-medium truncate">{content.prev.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}</span>
                <span className="text-xs text-fg-faint">Week {content.prev.week} · Day {content.prev.day}</span>
              </Link>
            ) : (<div />)}
            {content.next ? (
              <Link href={content.next.href} className={cn('flex flex-col gap-1 rounded-md border border-border p-3 text-right transition', 'hover:border-border-strong')}>
                <span className="flex items-center justify-end gap-1 text-xs text-fg-muted">다음 <ArrowRight className="h-3 w-3" /></span>
                <span className="text-sm font-medium truncate">{content.next.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}</span>
                <span className="text-xs text-fg-faint">Week {content.next.week} · Day {content.next.day}</span>
              </Link>
            ) : (<div />)}
          </footer>
        </div>
      </div>
      <Toc items={toc} />
    </div>
  );
}
