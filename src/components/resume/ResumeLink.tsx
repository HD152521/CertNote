'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Clock, ArrowRight } from 'lucide-react';
import { onProgressChange, readProgress, type ProgressEntry } from '@/lib/progress';
import { readPosition, resumeHref, shouldOfferResume } from '@/lib/readingPosition';

interface Resume {
  slug: string;
  entry: ProgressEntry;
  href: string;
  midway: boolean; // 노트 중간에서 멈췄는지(링크가 그 소제목으로 바로 간다)
}

// slug 가 있으면 그 자격증의 마지막 노트, 없으면 모든 자격증 중 가장 최근 노트.
// 영어판 노트(/en/...)는 한국어 화면에서 고르지 않는다.
function findResume(slug: string | undefined): Resume | null {
  const progress = readProgress();
  const candidates = Object.entries(progress)
    .filter(([s, v]) => (slug ? s === slug : true) && v.lastVisited && !v.lastVisited.href.startsWith('/en/'))
    .map(([s, v]) => ({ slug: s, entry: v.lastVisited! }))
    .sort((a, b) => b.entry.at - a.entry.at);
  const top = candidates[0];
  if (!top) return null;
  const pos = readPosition(top.entry.href);
  return { ...top, href: resumeHref(top.entry.href, pos), midway: shouldOfferResume(pos) };
}

// 홈·자격증 허브의 "이어서 보기" 줄(로그인 불필요, 이 브라우저의 기록만 쓴다).
// 기록이 없으면 아무것도 그리지 않는다 — 처음 온 사람에게는 보이지 않는다.
// codes 는 slug → 시험 코드(예: saa-c03 → SAA-C03). 홈처럼 여러 자격증 중에서 고를 때 어느 자격증인지 보여 준다.
export function ResumeLink({ slug, codes, className }: { slug?: string; codes?: Record<string, string>; className?: string }) {
  const [resume, setResume] = useState<Resume | null>(null);
  useEffect(() => {
    const refresh = () => setResume(findResume(slug));
    refresh();
    return onProgressChange(refresh);
  }, [slug]);
  if (!resume) return null;
  const { entry } = resume;
  const title = entry.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '');
  return (
    <Link
      href={resume.href}
      className={`group flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 transition hover:border-accent ${className ?? ''}`}
    >
      <Clock className="h-4 w-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-fg-muted">
          {resume.midway ? '읽던 곳부터 이어서 보기' : '이어서 보기'} · {slug ? '' : `${codes?.[resume.slug] ?? resume.slug} `}
          {entry.week}주차 {entry.day}일차
        </span>
        <span className="block truncate text-sm font-medium text-fg">{title}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-fg-faint transition group-hover:text-accent" />
    </Link>
  );
}
