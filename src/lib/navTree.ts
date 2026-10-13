import type { CertMeta, DayRef } from './content';

// 사이드바·모바일 드로어로 보내는 자격증 트리의 전송 형식.
//
// 이 트리는 루트 레이아웃(AppShell)에서 클라이언트 컴포넌트로 넘어가므로 **모든 페이지**의 HTML 에
// RSC 페이로드로 실린다. DayRef 를 그대로 넘기면 day 하나마다 category·slug·href 가 반복돼
// 1,377개 × 약 195바이트 = 269KB 가 됐다(홈 HTML 344KB 의 78%, docs/P3-step3-speed-report.md).
// href 는 (섹션, slug, 주차, day) 로 복원할 수 있으므로 화면에 필요한 값만 튜플로 싣는다.
//
// fs 비의존 모듈이다 — 클라이언트 컴포넌트(SidebarNav)가 import 한다.
export type NavDay = [day: number, title: string];
export type NavWeek = [week: number, days: NavDay[]];
export type NavCertMeta = Pick<CertMeta, 'slug' | 'code' | 'level' | 'section' | 'name'>;

export interface CertTree {
  meta: NavCertMeta;
  weeks: NavWeek[];
}

export function buildCertTree(meta: CertMeta, days: readonly DayRef[]): CertTree {
  const byWeek = new Map<number, NavDay[]>();
  for (const d of days) {
    byWeek.set(d.week, [...(byWeek.get(d.week) ?? []), [d.day, d.title]]);
  }
  return {
    meta: { slug: meta.slug, code: meta.code, level: meta.level, section: meta.section, name: meta.name },
    weeks: [...byWeek.entries()],
  };
}

// content.ts getAllDays 가 만드는 DayRef.href 와 같은 형식이어야 한다(navTree.test.ts 가 대조).
export function navDayHref(base: string, slug: string, week: number, day: number): string {
  return `/${base}/${slug}/week${week}/day${day}`;
}
