'use client';
import { DEFAULT_CATEGORY, EN_CATEGORY, certLevelLabel } from '@/lib/category';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CertMeta, DayRef } from '@/lib/content';
import { cn } from '@/lib/cn';

export interface CertTree {
  meta: CertMeta;
  days: DayRef[];
}

interface SidebarNavProps {
  certTrees: CertTree[];
  // 영어판 트리(/en 경로에서 대신 표시). 없으면 항상 한국어 트리.
  enCertTrees?: CertTree[];
  // 모바일 드로어에서 링크 클릭 시 드로어를 닫기 위한 콜백.
  onNavigate?: () => void;
}

// 자격증 트리 네비게이션. 데스크탑 Sidebar와 모바일 드로어가 공유한다.
// /en 경로에서는 영어판 트리(무료 Week1만 존재)를 보여준다.
export function SidebarNav({ certTrees, enCertTrees, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const isEn = pathname === `/${EN_CATEGORY}` || pathname.startsWith(`/${EN_CATEGORY}/`);
  const category = isEn && enCertTrees && enCertTrees.length > 0 ? EN_CATEGORY : DEFAULT_CATEGORY;
  const trees = category === EN_CATEGORY ? (enCertTrees as CertTree[]) : certTrees;
  const activeSlug = (() => {
    const m = pathname.match(new RegExp('^/' + category + '/([^/]+)'));
    return m ? m[1] : null;
  })();
  const [openSlugs, setOpenSlugs] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (activeSlug) init[activeSlug] = true;
    return init;
  });
  function toggle(slug: string) {
    setOpenSlugs((p) => ({ ...p, [slug]: !p[slug] }));
  }
  return (
    <nav className="space-y-1 text-sm">
      {trees.map(({ meta, days }) => {
        const isOpen = openSlugs[meta.slug] ?? false;
        const isActive = activeSlug === meta.slug;
        const byWeek = new Map<number, DayRef[]>();
        for (const d of days) {
          if (!byWeek.has(d.week)) byWeek.set(d.week, []);
          byWeek.get(d.week)!.push(d);
        }
        return (
          <div key={meta.slug}>
            {/* 자격증 이름 클릭 → 허브(시험정보·커리큘럼 개요) 이동. 화살표 → 트리 펼침/접힘 */}
            <div className={cn('group flex items-center rounded-md transition', 'hover:bg-bg-subtle', isActive && 'bg-bg-subtle')}>
              <Link href={`/${category}/${meta.slug}`} onClick={onNavigate}
                className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-2 py-1.5">
                <span className="font-mono text-[11px] text-fg-faint">{meta.code} · {certLevelLabel(meta.level)}</span>
                <span className="text-fg text-sm leading-tight">{meta.name}</span>
              </Link>
              <button type="button" onClick={() => toggle(meta.slug)}
                aria-label={`${meta.code} 주차 목록 ${isOpen ? '접기' : '펼치기'}`} aria-expanded={isOpen}
                className="shrink-0 rounded-md p-2 text-fg-faint hover:text-fg">
                <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
              </button>
            </div>
            {isOpen && (
              <ul className="mt-1 mb-2 ml-2 space-y-0.5 border-l border-border pl-2">
                {[...byWeek.entries()].map(([w, ws]) => (
                  <li key={w}>
                    <details open={pathname.includes(`/${category}/${meta.slug}/week${w}/`)}>
                      <summary className={cn('cursor-pointer rounded px-2 py-1 text-xs text-fg-muted', 'hover:bg-bg-subtle hover:text-fg list-none')}>Week {w}</summary>
                      <ul className="mt-0.5 ml-2 space-y-0.5 border-l border-border pl-2">
                        {ws.map((d) => {
                          const active = pathname === d.href;
                          return (
                            <li key={d.href}>
                              <Link href={d.href} onClick={onNavigate}
                                className={cn('block truncate rounded px-2 py-1 text-xs transition', active ? 'bg-accent/10 text-fg font-medium' : 'text-fg-muted hover:text-fg hover:bg-bg-subtle')}
                                title={d.title}>
                                <span className="text-fg-faint mr-1.5 tabular-nums">{d.day}.</span>
                                {d.title.replace(/^Day\s*\d+\s*[-–]\s*/i, '')}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
