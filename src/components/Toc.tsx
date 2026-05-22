'use client';
import { useEffect, useState } from 'react';
import type { TocItem } from '@/lib/toc';
import { cn } from '@/lib/cn';

interface TocProps { items: TocItem[]; }

export function Toc({ items }: TocProps) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!items.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);
  if (!items.length) return null;
  return (
    <aside className="hidden xl:block w-56 shrink-0 py-10 pl-8">
      <div className="sticky top-20">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-fg-faint">이 페이지</p>
        <ul className="space-y-1 text-sm border-l border-border">
          {items.map((it) => (
            <li key={it.id}>
              <a href={`#${it.id}`}
                className={cn('-ml-px block border-l border-transparent py-0.5 transition', it.depth === 3 ? 'pl-5 text-xs' : 'pl-3', active === it.id ? 'border-accent text-fg font-medium' : 'text-fg-muted hover:text-fg')}>
                {it.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
