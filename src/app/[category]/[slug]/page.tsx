import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getAllDays, getCertMeta, listCerts } from '@/lib/content';
import { cn } from '@/lib/cn';

interface PageProps { params: Promise<{ category: string; slug: string }>; }

export async function generateStaticParams() {
  const certs = await listCerts('aws-certs');
  return certs.map((c) => ({ category: 'aws-certs', slug: c.slug }));
}

export default async function CertIndexPage({ params }: PageProps) {
  const { category, slug } = await params;
  if (category !== 'aws-certs') notFound();
  let meta;
  try { meta = await getCertMeta(category, slug); } catch { notFound(); }
  const days = await getAllDays(category, slug);
  const byWeek = new Map<number, typeof days>();
  for (const d of days) {
    if (!byWeek.has(d.week)) byWeek.set(d.week, []);
    byWeek.get(d.week)!.push(d);
  }
  const firstDay = days[0];
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-fg-muted font-mono">
          <Link href="/" className="hover:text-fg">← 전체 자격증</Link>
          <span className="text-fg-faint">/</span>
          <span>{meta.code}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{meta.name}</h1>
        <p className="text-sm text-fg-muted">{meta.weeks}주 · 총 {meta.dayCount}일 · <span className={meta.level === 'professional' ? 'text-accent' : ''}>{meta.level === 'professional' ? 'Professional' : 'Associate'}</span></p>
        {firstDay && (
          <Link href={firstDay.href}
            className={cn('inline-flex items-center gap-2 rounded-md border border-border bg-bg-subtle', 'px-3 py-1.5 text-sm font-medium transition hover:border-border-strong')}>
            Week 1부터 시작 <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </header>
      <section className="space-y-6">
        {[...byWeek.entries()].map(([w, ws]) => (
          <div key={w} className="space-y-2">
            <h2 className="font-mono text-xs uppercase tracking-wider text-fg-faint">Week {w}</h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-bg-elevated">
              {ws.map((d) => (
                <li key={d.href}>
                  <Link href={d.href} className="flex items-center gap-3 px-4 py-3 hover:bg-bg-subtle transition">
                    <span className="font-mono text-xs text-fg-faint w-10 shrink-0">Day {d.day}</span>
                    <span className="flex-1 text-sm truncate">{d.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}</span>
                    <ArrowRight className="h-4 w-4 text-fg-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
