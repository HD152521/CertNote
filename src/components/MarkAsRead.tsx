'use client';

import { useEffect } from 'react';
import { markVisited } from '@/lib/progress';

interface MarkAsReadProps {
  slug: string;
  week: number;
  day: number;
  title: string;
  href: string;
}

export function MarkAsRead({ slug, week, day, title, href }: MarkAsReadProps) {
  useEffect(() => {
    const t = setTimeout(() => {
      markVisited(slug, { week, day, title, href, at: Date.now() });
    }, 800);
    return () => clearTimeout(t);
  }, [slug, week, day, title, href]);
  return null;
}
