import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { Metadata } from 'next';
import roadmaps from '../../content/roadmaps.json';
import { EN_INFO_PAIRS, EN_ROADMAP_ROLE_SLUGS, enInfoPathOf, infoHref, isEnInfoPath, koInfoPathOf } from '@/lib/enEdition';
import { privacyStrings } from '@/lib/strings/privacy';
import { ROADMAP_EN } from '@/lib/enPages/roadmapEn';
import { getChangelog } from '@/lib/trust/changelog';
import { classifyPath } from '@/lib/proxyRouting';
import { SITE_URL, OPERATOR_NAME } from '@/lib/site';
import sitemap from './sitemap';

import EnAboutPage, { metadata as enAboutMeta } from './en/about/page';
import EnHowWeMakePage, { metadata as enHowMeta } from './en/about/how-we-make/page';
import EnContactPage, { metadata as enContactMeta } from './en/contact/page';
import EnTermsPage, { metadata as enTermsMeta } from './en/terms/page';
import EnChangelogPage, { metadata as enChangelogMeta } from './en/changelog/page';
import EnRoadmapHubPage, { metadata as enRoadmapMeta } from './en/roadmap/page';
import EnRoadmapRolePage, { generateMetadata as enRoleMeta } from './en/roadmap/[role]/page';
import { metadata as enPrivacyMeta } from './en/privacy/page';

import { metadata as koAboutMeta } from './about/page';
import { metadata as koHowMeta } from './about/how-we-make/page';
import { metadata as koContactMeta } from './contact/page';
import { metadata as koTermsMeta } from './terms/page';
import { metadata as koChangelogMeta } from './changelog/page';
import { metadata as koRoadmapMeta } from './roadmap/page';
import { generateMetadata as koRoleMeta } from './roadmap/[role]/page';
import { metadata as koPrivacyMeta } from './privacy/page';

const HANGUL = /[ㄱ-ㆎ가-힣]/;
// 운영자명은 허용된 한글.
const stripAllowed = (s: string) => s.split(OPERATOR_NAME).join('');
const hasHangul = (s: string) => HANGUL.test(stripAllowed(s));
const metaText = (m: Metadata) => JSON.stringify({ title: m.title, description: m.description, og: m.openGraph });

const EN_PAGES: Array<[string, () => Promise<string> | string, Metadata]> = [
  ['/en/about', () => renderToStaticMarkup(createElement(EnAboutPage)), enAboutMeta],
  ['/en/about/how-we-make', () => renderToStaticMarkup(createElement(EnHowWeMakePage)), enHowMeta],
  ['/en/contact', () => renderToStaticMarkup(createElement(EnContactPage)), enContactMeta],
  ['/en/terms', () => renderToStaticMarkup(createElement(EnTermsPage)), enTermsMeta],
  ['/en/changelog', () => renderToStaticMarkup(createElement(EnChangelogPage)), enChangelogMeta],
  ['/en/roadmap', async () => renderToStaticMarkup(await EnRoadmapHubPage()), enRoadmapMeta],
];

describe('영어 정보 페이지 — 본문·메타데이터에 한글이 없다(주간랩스 제외)', () => {
  test.each(EN_PAGES)('%s', async (path, render, meta) => {
    const html = await render();
    expect(html.length).toBeGreaterThan(500);
    expect(hasHangul(html), `${path} 본문에 한글`).toBe(false);
    expect(hasHangul(metaText(meta)), `${path} 메타데이터에 한글`).toBe(false);
  });

  test.each(EN_ROADMAP_ROLE_SLUGS.map((s) => [s]))('/en/roadmap/%s', async (slug) => {
    const params = Promise.resolve({ role: slug });
    const html = renderToStaticMarkup(await EnRoadmapRolePage({ params }));
    expect(hasHangul(html), `${slug} 본문에 한글`).toBe(false);
    expect(html).toContain(`href="/en/`); // 단계 링크가 영어판 자격증 허브로 간다
    expect(html).not.toMatch(/href="\/aws\//);
    expect(hasHangul(metaText(await enRoleMeta({ params })))).toBe(false);
  });

  test('/en/privacy — 메타데이터와 영어 문구에 한글이 없다', () => {
    expect(hasHangul(metaText(enPrivacyMeta))).toBe(false);
    expect(hasHangul(Object.values(privacyStrings.en).join('\n'))).toBe(false);
  });
});

describe('영어 데이터가 한국어 정본과 어긋나지 않는다', () => {
  test('로드맵 역할 slug·단계 순서가 content/roadmaps.json 과 같다', () => {
    const roles = roadmaps.roles;
    expect([...EN_ROADMAP_ROLE_SLUGS].sort()).toEqual(roles.map((r) => r.slug).sort());
    expect(Object.keys(ROADMAP_EN).sort()).toEqual(roles.map((r) => r.slug).sort());
    for (const r of roles) {
      expect(ROADMAP_EN[r.slug].stepNotes.map((n) => n.cert)).toEqual(r.steps.map((s) => s.cert));
      expect(ROADMAP_EN[r.slug].faq.length).toBe(r.faq?.length);
      expect(ROADMAP_EN[r.slug].studyTips.length).toBe(r.studyTips?.length);
    }
  });

  test('수정 기록의 모든 항목에 한글 없는 영어 요약(summaryEn)이 있다', () => {
    for (const e of getChangelog()) {
      expect(e.summaryEn, e.summary).toBeTruthy();
      expect(hasHangul(e.summaryEn ?? '')).toBe(false);
    }
  });
});

describe('SEO — 사이트맵과 hreflang', () => {
  test('영어 정보 페이지 6개(+제작 방식 +직무 로드맵 6개)가 사이트맵에 있다', { timeout: 30000 }, async () => {
    const urls = (await sitemap()).map((e) => e.url);
    for (const p of ['/en/about', '/en/roadmap', '/en/changelog', '/en/contact', '/en/terms', '/en/privacy', '/en/about/how-we-make']) {
      expect(urls, p).toContain(`${SITE_URL}${p}`);
    }
    for (const slug of EN_ROADMAP_ROLE_SLUGS) expect(urls).toContain(`${SITE_URL}/en/roadmap/${slug}`);
    expect(EN_INFO_PAIRS.length).toBe(7 + EN_ROADMAP_ROLE_SLUGS.length);
    expect(new Set(urls).size).toBe(urls.length); // 중복 없음
  });

  const PAIRS: Array<[string, Metadata, Metadata]> = [
    ['/about', koAboutMeta, enAboutMeta],
    ['/about/how-we-make', koHowMeta, enHowMeta],
    ['/contact', koContactMeta, enContactMeta],
    ['/terms', koTermsMeta, enTermsMeta],
    ['/changelog', koChangelogMeta, enChangelogMeta],
    ['/roadmap', koRoadmapMeta, enRoadmapMeta],
    ['/privacy', koPrivacyMeta, enPrivacyMeta],
  ];

  test.each(PAIRS)('%s ↔ 영어판: canonical 은 자기 주소, languages 는 완전히 같은 객체(상호·자기 참조)', (ko, koMeta, enMeta) => {
    const en = `/en${ko}`;
    expect(koMeta.alternates?.canonical).toBe(ko);
    expect(enMeta.alternates?.canonical).toBe(en);
    expect(koMeta.alternates?.languages).toEqual(enMeta.alternates?.languages);
    expect(koMeta.alternates?.languages).toEqual({ ko, en });
  });

  test.each(EN_ROADMAP_ROLE_SLUGS.map((s) => [s]))('/roadmap/%s ↔ /en/roadmap/%s', async (slug) => {
    const params = Promise.resolve({ role: slug });
    const ko = await koRoleMeta({ params });
    const en = await enRoleMeta({ params });
    expect(ko.alternates?.canonical).toBe(`/roadmap/${slug}`);
    expect(en.alternates?.canonical).toBe(`/en/roadmap/${slug}`);
    expect(ko.alternates?.languages).toEqual(en.alternates?.languages);
    expect(ko.alternates?.languages).toEqual({ ko: `/roadmap/${slug}`, en: `/en/roadmap/${slug}` });
  });
});

describe('링크·라우팅', () => {
  test('한국어 화면의 링크는 그대로, 영어 화면은 /en/... 로 간다', () => {
    for (const { ko, en } of EN_INFO_PAIRS) {
      expect(infoHref(ko, 'ko')).toBe(ko);
      expect(infoHref(ko, 'en')).toBe(en);
      expect(enInfoPathOf(ko)).toBe(en);
      expect(koInfoPathOf(en)).toBe(ko);
    }
    expect(infoHref('/pricing', 'en')).toBe('/pricing'); // 영어판이 없으면 그대로
  });

  test('프록시는 영어 정보 페이지를 통과시키고, 없는 /en/... 는 여전히 콘텐츠 검증으로 보낸다', () => {
    for (const { en } of EN_INFO_PAIRS) {
      expect(isEnInfoPath(en)).toBe(true);
      expect(classifyPath(en)).toBe('pass');
    }
    expect(classifyPath('/en/saa-c03')).toBe('content');
    expect(classifyPath('/en/nonexistent')).toBe('content');
    expect(classifyPath('/en/about/extra')).toBe('content');
  });
});
