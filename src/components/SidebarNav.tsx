'use client';
import { EN_CATEGORY, SECTIONS, certLevelLabel, sectionLabel } from '@/lib/category';
import type { Section } from '@/lib/category';
import { useLanguage } from '@/lib/i18n-client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight, ChevronDown, MessageSquareText, Repeat } from 'lucide-react';
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

// 섹션(주제) 우선 네비게이션: AWS / Linux … → 각 섹션 안에서 [자격증 목록 · 합격 후기 · 문제 복기].
// 데스크탑 Sidebar와 모바일 드로어가 공유한다. /en 경로에서는 영어판 트리(무료 Week1)를 보여준다.
export function SidebarNav({ certTrees, enCertTrees, onNavigate }: SidebarNavProps) {
  const lang = useLanguage();
  const en = lang === 'en';
  const pathname = usePathname();
  const isEn = pathname === `/${EN_CATEGORY}` || pathname.startsWith(`/${EN_CATEGORY}/`);
  const trees = isEn && enCertTrees && enCertTrees.length > 0 ? enCertTrees : certTrees;

  // 섹션별 그룹핑. en 모드는 aws 트랙(무료 Week1)만 있으므로 단일 그룹.
  const bySection = new Map<string, CertTree[]>();
  for (const t of trees) {
    const sec = isEn ? 'aws' : t.meta.section ?? 'aws';
    if (!bySection.has(sec)) bySection.set(sec, []);
    bySection.get(sec)!.push(t);
  }
  const orderedSections = [
    ...SECTIONS.filter((s) => bySection.has(s)),
    ...[...bySection.keys()].filter((s) => !(SECTIONS as readonly string[]).includes(s)),
  ];

  // 현재 경로의 섹션·자격증(기본 펼침 대상).
  const activeSection = isEn ? 'aws' : pathname.match(/^\/([^/]+)(?:\/|$)/)?.[1] ?? null;
  const activeSlug = pathname.match(/^\/[^/]+\/([^/]+)/)?.[1] ?? null;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    activeSection ? { [activeSection]: true } : {},
  );
  const [openSlugs, setOpenSlugs] = useState<Record<string, boolean>>(() =>
    activeSlug ? { [activeSlug]: true } : {},
  );

  const certBase = (meta: CertMeta): string => (isEn ? EN_CATEGORY : meta.section ?? 'aws');

  function renderCert({ meta, days }: CertTree) {
    const isOpen = openSlugs[meta.slug] ?? false;
    const base = certBase(meta);
    const isActive = activeSlug === meta.slug;
    const byWeek = new Map<number, DayRef[]>();
    for (const d of days) {
      if (!byWeek.has(d.week)) byWeek.set(d.week, []);
      byWeek.get(d.week)!.push(d);
    }
    return (
      <div key={meta.slug}>
        <div className={cn('group flex items-center rounded-md transition hover:bg-bg-subtle', isActive && 'bg-bg-subtle')}>
          <Link
            href={`/${base}/${meta.slug}`}
            onClick={onNavigate}
            className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md px-2 py-1.5"
          >
            <span className="font-mono text-[11px] text-fg-faint">{meta.code} · {certLevelLabel(meta.level, (meta.section as Section) ?? 'aws')}</span>
            <span className="text-sm leading-tight text-fg">{meta.name}</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpenSlugs((p) => ({ ...p, [meta.slug]: !p[meta.slug] }))}
            aria-label={`${meta.code} ${en ? 'weeks' : '주차'} ${isOpen ? (en ? 'collapse' : '접기') : en ? 'expand' : '펼치기'}`}
            aria-expanded={isOpen}
            className="shrink-0 rounded-md p-2 text-fg-faint hover:text-fg"
          >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} />
          </button>
        </div>
        {isOpen && (
          <ul className="mt-1 mb-2 ml-2 space-y-0.5 border-l border-border pl-2">
            {[...byWeek.entries()].map(([w, ws]) => (
              <li key={w}>
                <details open={pathname.includes(`/${base}/${meta.slug}/week${w}/`)}>
                  <summary className="cursor-pointer list-none rounded px-2 py-1 text-xs text-fg-muted hover:bg-bg-subtle hover:text-fg">
                    Week {w}
                  </summary>
                  <ul className="mt-0.5 ml-2 space-y-0.5 border-l border-border pl-2">
                    {ws.map((d) => {
                      const active = pathname === d.href;
                      return (
                        <li key={d.href}>
                          <Link
                            href={d.href}
                            onClick={onNavigate}
                            className={cn(
                              'block truncate rounded px-2 py-1 text-xs transition',
                              active ? 'bg-accent/10 font-medium text-fg' : 'text-fg-muted hover:bg-bg-subtle hover:text-fg',
                            )}
                            title={d.title}
                          >
                            <span className="mr-1.5 tabular-nums text-fg-faint">{d.day}.</span>
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
  }

  return (
    <nav className="space-y-1.5 text-sm">
      {orderedSections.map((section) => {
        const sectionTrees = bySection.get(section) ?? [];
        const open = openSections[section] ?? false;
        const label = sectionLabel(section as Section);
        return (
          <div key={section} className="rounded-md">
            <button
              type="button"
              onClick={() => setOpenSections((p) => ({ ...p, [section]: !p[section] }))}
              aria-expanded={open}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-bg-subtle',
                activeSection === section && 'text-fg',
              )}
            >
              <span className="text-sm font-semibold tracking-tight">{label}</span>
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-fg-faint transition-transform', !open && '-rotate-90')} />
            </button>

            {open && (
              <div className="mt-1 space-y-1 pl-1">
                {sectionTrees.map(renderCert)}

                {/* 섹션 공용 공간: 후기 · 문제 복기 (en 모드에선 ko 전용이라 생략) */}
                {!isEn && (
                  <div className="mt-1 space-y-0.5 border-t border-border pt-1.5">
                    <Link
                      href={`/${section}/reviews`}
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-bg-subtle',
                        pathname.startsWith(`/${section}/reviews`) ? 'text-accent' : 'text-fg-muted hover:text-fg',
                      )}
                    >
                      <MessageSquareText className="h-3.5 w-3.5 shrink-0" /> 합격 후기
                    </Link>
                    <Link
                      href="/review"
                      onClick={onNavigate}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-bg-subtle',
                        pathname === '/review' ? 'text-accent' : 'text-fg-muted hover:text-fg',
                      )}
                    >
                      <Repeat className="h-3.5 w-3.5 shrink-0" /> 문제 복기
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
