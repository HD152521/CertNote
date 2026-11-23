'use client';

import { useEffect, useState } from 'react';
import type { Language } from '@/lib/i18n';
import { onProgressChange, readProgress, type ProgressEntry } from '@/lib/progress';
import { readPosition, resumeHref, shouldOfferResume } from '@/lib/readingPosition';

export interface Resume {
  slug: string;
  entry: ProgressEntry;
  href: string;
  midway: boolean; // 노트 중간에서 멈췄는지(링크가 그 소제목으로 바로 간다)
}

const isEnglishHref = (href: string): boolean => href.startsWith('/en/');

// slug 가 있으면 그 자격증의 마지막 노트, 없으면 모든 자격증 중 가장 최근 노트.
// 언어별로 그 언어의 노트만 고른다(한국어 화면은 /en/... 를, 영어 화면은 한국어 노트를 고르지 않는다).
export function findResume(slug: string | undefined, lang: Language = 'ko'): Resume | null {
  const progress = readProgress();
  const candidates = Object.entries(progress)
    .filter(
      ([s, v]) =>
        (slug ? s === slug : true) && v.lastVisited && isEnglishHref(v.lastVisited.href) === (lang === 'en'),
    )
    .map(([s, v]) => ({ slug: s, entry: v.lastVisited! }))
    .sort((a, b) => b.entry.at - a.entry.at);
  const top = candidates[0];
  if (!top) return null;
  const pos = readPosition(top.entry.href);
  return { ...top, href: resumeHref(top.entry.href, pos), midway: shouldOfferResume(pos) };
}

// 이 브라우저의 읽은 기록(localStorage)에서 이어 볼 노트를 찾는다. 서버 렌더·첫 렌더는 항상 null —
// 마운트 뒤에만 읽으므로 정적 프리렌더와 hydration 을 해치지 않는다.
export function useResume(slug?: string, lang: Language = 'ko'): Resume | null {
  const [resume, setResume] = useState<Resume | null>(null);
  useEffect(() => {
    const refresh = () => setResume(findResume(slug, lang));
    refresh();
    return onProgressChange(refresh);
  }, [slug, lang]);
  return resume;
}
