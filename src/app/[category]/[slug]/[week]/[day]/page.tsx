import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { getAllDayParams, getDay, previewOf } from '@/lib/content';
import { buildToc } from '@/lib/toc';
import { readingTimeMinutes } from '@/lib/readingTime';
import { getCurrentUser } from '@/lib/auth/currentUser';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { FREE_WEEK } from '@/lib/entitlement/policy';
import { Article } from '@/components/Article';
import { Paywall } from '@/components/Paywall';
import { Toc } from '@/components/Toc';
import { MarkAsRead } from '@/components/MarkAsRead';
import { DayMeta } from '@/components/DayMeta';
import { cn } from '@/lib/cn';

interface PageProps { params: Promise<{ category: string; slug: string; week: string; day: string }>; }

// 무료(Week ≤ FREE_WEEK)만 정적 생성 → CDN 캐시. 유료 주차는 dynamicParams로 온디맨드 렌더되며,
// 그때 쿠키(로그인)·권한을 읽어 게이팅한다(잠긴 본문은 응답에 포함되지 않음).
export async function generateStaticParams() {
  const params = await getAllDayParams('aws-certs');
  return params
    .filter((p) => Number.parseInt(p.week.slice('week'.length), 10) <= FREE_WEEK)
    .map((p) => ({ category: 'aws-certs', ...p }));
}

export const dynamicParams = true;

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

  // 무료 주차는 인증을 읽지 않아 정적으로 유지된다. 유료 주차에서만 쿠키·권한을 읽어 동적 렌더.
  let locked = false;
  let loggedIn = false;
  if (w > FREE_WEEK) {
    const session = await getCurrentUser();
    loggedIn = Boolean(session);
    const ent = session ? await getEntitlementService().getEntitlement(session.sub) : null;
    locked = !ent?.isPro;
  }

  const readingMinutes = readingTimeMinutes(content.body);
  // 잠겼으면 미리보기만 렌더(전체 본문은 HTML에 싣지 않음). 열렸으면 전체 TOC.
  const toc = locked ? [] : buildToc(content.body);

  return (
    <div className="flex gap-0">
      {!locked && (
        <MarkAsRead slug={slug} week={w} day={d} title={content.title} href={content.href} />
      )}
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
          {locked ? (
            <>
              <div className="relative max-h-[28rem] overflow-hidden">
                <Article source={previewOf(content.body)} slug={slug} week={w} day={d} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
              </div>
              <Paywall loggedIn={loggedIn} />
            </>
          ) : (
            <Article source={content.body} slug={slug} week={w} day={d} />
          )}
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
