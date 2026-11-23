import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORY, EN_CATEGORY } from '@/lib/category';
import { listCerts } from '@/lib/content';
import { DAILY_STUDY_MINUTES } from '@/lib/studyTime';
import { homeStrings } from '@/lib/strings/home';
import { FeaturedCerts, FEATURED_SLUGS } from './FeaturedCerts';
import { HERO_SLOT_FRAME, HeroSlotView } from './HeroSlot';
import { HomeHero } from './HomeHero';
import { certCodes, heroFeatured } from './homeData';
import { Landing } from './Landing';
import { buildHomeStats } from '@/lib/homeStats';
import EnHomePage from '@/app/(en)/en/page';

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const root = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

function hrefs(html: string): string[] {
  return [...html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);
}

async function renderShared(lang: 'ko' | 'en'): Promise<string> {
  const certs = await listCerts(lang === 'en' ? EN_CATEGORY : DEFAULT_CATEGORY);
  return renderToStaticMarkup(
    createElement('div', null,
      createElement(HomeHero, { lang, featured: heroFeatured(certs, lang), codes: certCodes(certs), browseHref: '#tracks' }),
      createElement(FeaturedCerts, { lang, certs }),
    ),
  );
}

describe('홈 공용 컴포넌트 — 한국어·영어 같은 구조', () => {
  it('두 언어가 같은 자리(히어로 대표 카드, 트랙 목록)를 렌더한다', async () => {
    const [ko, en] = await Promise.all([renderShared('ko'), renderShared('en')]);
    for (const html of [ko, en]) {
      expect(html).toContain('data-hero-slot="featured"');
      expect(html).toContain('id="tracks"');
      expect(html).toContain('<h1');
    }
  });

  it('자격증 링크가 서버 HTML 에 14개 이상 <a href> 로 있고 두 언어의 수가 같다', async () => {
    const [ko, en] = await Promise.all([renderShared('ko'), renderShared('en')]);
    const koCerts = hrefs(ko).filter((h) => /^\/(aws|linux|data)\/[^/]+$/.test(h));
    const enCerts = hrefs(en).filter((h) => /^\/en\/[^/]+$/.test(h));
    expect(new Set(koCerts).size).toBeGreaterThanOrEqual(14);
    expect(new Set(enCerts).size).toBe(new Set(koCerts).size);
  });

  it('큰 타일은 FEATURED_SLUGS 만이고 나머지는 목록이다(균일 격자가 아니다)', async () => {
    const html = await renderShared('en');
    const tile = (slug: string) => new RegExp(`md:col-span-[^>]*href="/en/${slug}"`).test(html);
    for (const slug of FEATURED_SLUGS) expect(tile(slug), slug).toBe(true);
    expect(tile('sqld')).toBe(false);
  });

  it('영어 홈 전체에 한글이 없다', async () => {
    const html = renderToStaticMarkup(await EnHomePage());
    expect(HANGUL.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))).toBe(false);
    expect(html).toContain('data-home-page');
    expect(html).toContain('one day at a time');
  });

  it('한국어·영어 문구 키가 짝이고 한쪽만 한글이다', () => {
    expect(Object.keys(homeStrings.ko).sort()).toEqual(Object.keys(homeStrings.en).sort());
    expect(HANGUL.test(Object.values(homeStrings.en).join(' '))).toBe(false);
  });
});

describe('홈 SEO 문구 보존', () => {
  it('한국어 H1·첫 문단이 기존 글자 그대로다', async () => {
    const html = await renderShared('ko');
    expect(html).toContain('한국어로 배우는<br/><span class="text-accent">AWS 자격증 합격 가이드</span>');
    expect(html).toContain(`주차별 구조화된 커리큘럼 • 매일 ${DAILY_STUDY_MINUTES}분 안팎 심화 노트 • 연습문제·모의고사·간격반복 복습까지. 전 과정 무료.`);
  });

  it('영어 H1·설명이 기존 글자 그대로다', async () => {
    const html = await renderShared('en');
    expect(html).toContain('Certification prep, <br/><span class="text-accent">one day at a time</span>');
    expect(html).toContain('In-depth daily study notes for 11 AWS certifications, SQL Developer (SQLD) and Linux Master Level 1 and 2 — written to be read on your commute, with practice questions after every lesson. <strong');
    expect(html).toContain('Everything is free to read, and every track is fully available in English.');
  });
});

describe('히어로 자리 — 교체해도 레이아웃이 밀리지 않는다', () => {
  const featured = { code: 'SAA-C03', name: 'Solutions Architect - Associate', weeks: 12, dayCount: 60, href: '/aws/saa-c03' };
  const resume = {
    slug: 'saa-c03',
    entry: { week: 2, day: 3, title: 'Day 3 - VPC', href: '/aws/saa-c03/week-2/day-3', at: 1 },
    href: '/aws/saa-c03/week-2/day-3',
    midway: false,
  };
  const render = (r: typeof resume | null) =>
    renderToStaticMarkup(createElement(HeroSlotView, { lang: 'ko', featured, codes: { 'saa-c03': 'SAA-C03' }, resume: r }));

  it('대표 카드와 이어서 읽기가 같은 고정 높이 틀 클래스를 쓴다', () => {
    expect(HERO_SLOT_FRAME).toMatch(/\bmin-h-\[[\d.]+rem\]/);
    expect(HERO_SLOT_FRAME).not.toMatch(/overflow-hidden|(^|\s)h-\[/);
    expect(HERO_SLOT_FRAME).toMatch(/\bsm:min-h-\[[\d.]+rem\]/);
    expect(render(null)).toContain(`class="${HERO_SLOT_FRAME}"`);
    const resumed = render(resume);
    expect(resumed).toContain(`class="${HERO_SLOT_FRAME}"`);
    expect(resumed).toContain('data-hero-slot="resume"');
    expect(resumed).toContain('VPC');
    expect(resumed).not.toContain('Day 3 -');
  });

  it('서버 첫 렌더(기록 없음)는 대표 자격증이다', () => {
    expect(render(null)).toContain('data-hero-slot="featured"');
    expect(render(null)).toContain('href="/aws/saa-c03"');
  });
});

describe('사이드바 중복 제거는 CSS 로만 한다', () => {
  it('셸 줄이 홈 표식을 :has() 로 감지해 사이드바 열을 숨긴다', () => {
    const css = root('src/app/globals.css');
    expect(css).toMatch(/\.app-shell-row:has\(\[data-home-page\]\)\s*>\s*\.app-shell-sidebar\s*\{\s*display:\s*none/);
    expect(root('src/components/AppShell.tsx')).toContain('app-shell-row');
    expect(root('src/components/Sidebar.tsx')).toContain('app-shell-sidebar');
  });

  it('한국어·영어 홈 본문이 같은 표식을 단다', async () => {
    const certs = await listCerts(DEFAULT_CATEGORY);
    const ko = renderToStaticMarkup(createElement(Landing, { ...buildHomeStats(certs), certs }));
    expect(ko).toContain('data-home-page');
    expect(root('src/app/(en)/en/page.tsx')).toContain('data-home-page');
  });
});

describe('접근성·표식 위치', () => {
  it('히어로 카드 링크에 코드+이름+행동의 aria-label 이 있다', async () => {
    const html = await renderShared('en');
    expect(html).toMatch(/data-hero-slot="featured"[^>]*aria-label="[A-Z0-9-]+ [^"]+ — Start with Week 1"/);
  });

  it('data-home-page 는 Landing.tsx 와 en/page.tsx 두 곳에만 있다', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(tsx?|css)$/.test(e.name) && !e.name.endsWith('.test.ts') && readFileSync(p, 'utf8').includes('data-home-page')) {
          hits.push(p.split(sep).join('/').split('/src/')[1]);
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(hits.sort()).toEqual(['app/(en)/en/page.tsx', 'app/globals.css', 'components/marketing/Landing.tsx']);
  });
});

describe('홈 새 서버 컴포넌트 — 정적 프리렌더 조건', () => {
  const FORBIDDEN = ['next/headers', '@/lib/auth/currentUser', '@/lib/db', '@/lib/auth/session'];
  it.each(['HomeHero.tsx', 'FeaturedCerts.tsx', 'homeData.ts', 'HeroSlot.tsx'])('%s 가 쿠키·세션·DB 를 import 하지 않는다', (file) => {
    const source = readFileSync(join(__dirname, file), 'utf8');
    for (const spec of FORBIDDEN) expect(source.includes(`from '${spec}'`), `${file}: ${spec}`).toBe(false);
  });

  it('HeroSlot 은 클라이언트 컴포넌트이고 기록은 훅(마운트 뒤)에서만 읽는다', () => {
    const slot = readFileSync(join(__dirname, 'HeroSlot.tsx'), 'utf8');
    expect(slot.startsWith("'use client'")).toBe(true);
    expect(slot).not.toMatch(/localStorage/);
    const hook = root('src/components/resume/useResume.ts');
    expect(hook).toMatch(/useEffect\(\(\) => \{\s*const refresh/);
  });
});
