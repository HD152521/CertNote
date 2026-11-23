'use client';

import Link from 'next/link';
import { Clock, ArrowRight } from 'lucide-react';
import { markResumeIntent } from '@/lib/readingPosition';
import { useResume } from './useResume';

// 홈·자격증 허브의 "이어서 보기" 줄(로그인 불필요, 이 브라우저의 기록만 쓴다).
// 기록이 없으면 아무것도 그리지 않는다 — 처음 온 사람에게는 보이지 않는다.
// codes 는 slug → 시험 코드(예: saa-c03 → SAA-C03). 여러 자격증 중에서 고를 때 어느 자격증인지 보여 준다.
export function ResumeLink({ slug, codes, className }: { slug?: string; codes?: Record<string, string>; className?: string }) {
  const resume = useResume(slug);
  if (!resume) return null;
  const { entry } = resume;
  const title = entry.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '');
  return (
    <Link
      href={resume.href}
      onClick={() => resume.midway && markResumeIntent(entry.href)}
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
