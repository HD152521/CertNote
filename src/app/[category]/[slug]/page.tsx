import { DEFAULT_CATEGORY } from '@/lib/category';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { ArrowRight } from 'lucide-react';
import { getAllDays, getCertMeta, listCerts, certLevelLabel } from '@/lib/content';
import { getExamInfo } from '@/lib/examInfo';
import ExamInfoCard from '@/components/ExamInfoCard';
import { cn } from '@/lib/cn';

interface PageProps { params: Promise<{ category: string; slug: string }>; }

export async function generateStaticParams() {
  const certs = await listCerts(DEFAULT_CATEGORY);
  return certs.map((c) => ({ category: DEFAULT_CATEGORY, slug: c.slug }));
}

// 자격증 허브 = "SAA-C03 정리" 류 검색의 랜딩 페이지. 자격증별 제목·요약·canonical.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, slug } = await params;
  if (category !== DEFAULT_CATEGORY) return {};
  let meta;
  try {
    meta = await getCertMeta(category, slug);
  } catch {
    return {};
  }
  const title = `${meta.code} ${meta.name} — ${meta.weeks}주 완성 학습 노트`;
  const description = `${meta.code} 시험을 ${meta.weeks}주(총 ${meta.dayCount}일) 한국어 커리큘럼으로 준비하세요. 매일 읽는 심화 노트 + 연습 문제 + 모의고사·복습. Week 1은 무료.`;
  const url = `/${category}/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
  };
}

export default async function CertIndexPage({ params }: PageProps) {
  const { category, slug } = await params;
  if (category !== DEFAULT_CATEGORY) notFound();
  let meta;
  try { meta = await getCertMeta(category, slug); } catch { notFound(); }
  const days = await getAllDays(category, slug);
  const byWeek = new Map<number, typeof days>();
  for (const d of days) {
    if (!byWeek.has(d.week)) byWeek.set(d.week, []);
    byWeek.get(d.week)!.push(d);
  }
  const firstDay = days[0];
  const examInfo = getExamInfo(slug);
  // 구글이 이 페이지를 "강좌"로 이해하게 하는 구조화 데이터(JSON-LD).
  const courseLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: `${meta.code} ${meta.name}`,
    description: `${meta.weeks}주(총 ${meta.dayCount}일) ${meta.code} 자격증 한국어 학습 커리큘럼`,
    provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    inLanguage: 'ko',
    isAccessibleForFree: true,
    url: `${SITE_URL}/${category}/${slug}`,
  };
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(courseLd) }} />
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-fg-muted font-mono">
          <Link href="/" className="hover:text-fg">← 전체 자격증</Link>
          <span className="text-fg-faint">/</span>
          <span>{meta.code}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{meta.name}</h1>
        <p className="text-sm text-fg-muted">{meta.weeks}주 · 총 {meta.dayCount}일 · <span className={meta.level === 'professional' || meta.level === 'specialty' ? 'text-accent' : ''}>{certLevelLabel(meta.level)}</span></p>
        {firstDay && (
          <Link href={firstDay.href}
            className={cn('inline-flex items-center gap-2 rounded-md border border-border bg-bg-subtle', 'px-3 py-1.5 text-sm font-medium transition hover:border-border-strong')}>
            Week 1부터 시작 <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </header>
      {examInfo && <ExamInfoCard info={examInfo} />}
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
