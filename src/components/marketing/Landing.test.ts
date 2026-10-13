import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CertMeta } from '@/lib/content';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sumDayCount } from '@/lib/homeStats';
import { getAllQuestions } from '@/lib/questions';
import { DAILY_STUDY_MINUTES } from '@/lib/studyTime';
import { Landing } from './Landing';

// 이 프로젝트엔 DOM 테스트 라이브러리가 없다. react-dom/server 로 마크업 문자열을 얻어
// 렌더 결과(텍스트·JSON-LD)를 직접 단언한다. 실제 프로덕션 meta 와 **일부러 다른** 주차 범위를
// 쓰는 픽스처라, 주차 수를 하드코딩하면(예: 12, 6, 16) 이 테스트가 깨진다.

function cert(slug: string, section: 'aws' | 'linux', weeks: number, order: number): CertMeta {
  return {
    slug,
    code: slug.toUpperCase(),
    level: 'associate',
    section,
    name: `${slug} 이름`,
    weeks,
    accent: '#000',
    order,
    dayCount: weeks * 5,
    sourceRepo: 'x',
    syncedAt: '2026-01-01',
  };
}

// AWS 주차 범위: 7~20 / 전체(리눅스 포함) 범위: 3~31 — 둘이 다르다.
const CERTS: CertMeta[] = [
  cert('saa-c03', 'aws', 9, 1),
  cert('clf-c02', 'aws', 7, 2),
  cert('sap-c02', 'aws', 20, 3),
  cert('linux-master-1', 'linux', 31, 4),
  cert('linux-master-2', 'linux', 3, 5),
];
const PROPS = { certCount: 5, pageCount: 4321, questionCount: 7654, certs: CERTS };

function renderHtml(props = PROPS): string {
  return renderToStaticMarkup(createElement(Landing, props));
}

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function visibleText(html: string): string {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/g, '');
  return decode(noScript.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function readFaqFromMarkup(html: string): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [];
  const re = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  for (const m of html.matchAll(re)) out.push({ q: decode(m[1]), a: decode(m[2]) });
  return out;
}

function readFaqLd(html: string): { q: string; a: string }[] {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const faq = scripts.map((m) => JSON.parse(m[1])).find((j) => j['@type'] === 'FAQPage');
  expect(faq, 'FAQPage JSON-LD 가 있어야 한다').toBeTruthy();
  return faq.mainEntity.map((e: { name: string; acceptedAnswer: { text: string } }) => ({
    q: e.name,
    a: e.acceptedAnswer.text,
  }));
}

describe('Landing — 주차 수', () => {
  const text = visibleText(renderHtml());

  it('하이라이트의 주차 범위는 전달된 certs 전체(3~31)에서 파생된다', () => {
    expect(text).toContain('3~31주');
  });

  it('FAQ 의 주차 범위는 AWS 트랙(7~20)에서 파생된다', () => {
    expect(text).toContain('AWS 트랙은 7주에서 20주');
  });

  it('프로덕션 값인 고정 문구 "12주 주차별" 이 남아 있지 않다', () => {
    expect(text).not.toContain('12주 주차별');
    expect(text).not.toMatch(/(^|[^\d])12주/);
  });

  it('리눅스 트랙이 없으면 하이라이트는 AWS 범위를 쓴다(빈 certs 는 주차 문구를 숨긴다)', () => {
    const awsOnly = visibleText(renderHtml({ ...PROPS, certs: CERTS.filter((c) => c.section === 'aws') }));
    expect(awsOnly).toContain('7~20주');
    const none = visibleText(renderHtml({ ...PROPS, certs: [] }));
    expect(none).not.toMatch(/\d+~\d+주/);
    expect(none).not.toContain('주에서');
  });
});

describe('Landing — 검증 불가 주장 제거', () => {
  const html = renderHtml();
  const text = visibleText(html);

  it('경쟁사 이름과 가격이 렌더되지 않는다', () => {
    for (const banned of ['Udemy', 'Coursera', 'Pluralsight', '경쟁사', '₩15', '₩40', '₩25', '가격 비교']) {
      expect(html, banned).not.toContain(banned);
    }
    expect(html).not.toContain('<table');
  });

  it('출처 없는 최상급·유일 표현이 없다', () => {
    for (const banned of ['유일', '가장 인기', '가장 널리', '출퇴근 15분', '구직공고']) {
      expect(text, banned).not.toContain(banned);
    }
  });
});

describe('Landing — 제공 항목 섹션', () => {
  const text = visibleText(renderHtml());

  it('props 로 받은 수치를 그대로 보여준다', () => {
    expect(text).toContain('4,321');
    expect(text).toContain('7,654');
  });

  it('로그인 불필요 항목과 가입 필요 항목을 구분해 적는다', () => {
    expect(text).toContain('로그인 없이');
    expect(text).toContain('무료 가입 필요');
  });

  it('props 가 바뀌면 수치도 바뀐다(하드코딩 방지)', () => {
    const other = visibleText(renderHtml({ ...PROPS, pageCount: 111, questionCount: 222 }));
    expect(other).toContain('222');
    expect(other).not.toContain('7,654');
  });
});

describe('Landing — 본문 분량', () => {
  it('실제 meta.json 과 실제 집계 수치로 렌더 텍스트가 2,000자 이상이다', () => {
    const root = join(process.cwd(), 'content', 'aws-certs');
    const real = readdirSync(root)
      .filter((d) => existsSync(join(root, d, 'meta.json')))
      .map((d) => JSON.parse(readFileSync(join(root, d, 'meta.json'), 'utf8')) as CertMeta);
    expect(real.length).toBeGreaterThanOrEqual(13);
    const props = { certCount: real.length, pageCount: sumDayCount(real), questionCount: getAllQuestions().length, certs: real };
    const len = visibleText(renderHtml(props)).length;
    expect(len).toBeGreaterThanOrEqual(2000);
  });
});

describe('Landing — FAQ 와 JSON-LD 1:1', () => {
  it('화면에 그려진 FAQ 와 FAQPage JSON-LD 의 질문·답변이 순서까지 같다', () => {
    const html = renderHtml();
    const rendered = readFaqFromMarkup(html);
    const ld = readFaqLd(html);
    expect(rendered.length).toBeGreaterThanOrEqual(4);
    expect(rendered).toEqual(ld);
  });

  it('certs 가 비어 주차 질문이 빠져도 1:1 이 유지된다', () => {
    const html = renderHtml({ ...PROPS, certs: [] });
    expect(readFaqFromMarkup(html)).toEqual(readFaqLd(html));
  });
});

describe('Landing — 정정된 문구', () => {
  const text = visibleText(renderHtml());

  it('하루 학습 시간은 단일 상수에서 온다(히어로·SAA 카드·FAQ)', () => {
    const hits = text.split(`${DAILY_STUDY_MINUTES}분`).length - 1;
    expect(hits).toBeGreaterThanOrEqual(3);
    expect(text).not.toMatch(/15분/);
  });

  it('가장 짧은/긴 AWS 트랙은 certs 에서 파생된다(전문 분야가 길다는 단정이 없다)', () => {
    expect(text).toContain('가장 짧은 트랙은 CLF-C02(7주), 가장 긴 트랙은 SAP-C02(20주)');
    expect(text).not.toContain('전문 분야');
    expect(text).not.toContain('프로페셔널');
  });

  it('결과를 암시하는 슬로건이 없다', () => {
    expect(text).not.toContain('일회 합격');
    expect(text).not.toContain('재시험');
  });

  it('복습·모의고사가 가입 필요임을 SAA 카드와 안내 줄에서 밝힌다', () => {
    expect(text).toContain('모의고사·복습·AI 설명은 무료 가입 후 이용');
    expect(text).toContain('실전 모의고사 · 간격반복 복습 (무료 가입 후 이용)');
    expect(text).toContain('틀린 문제는 간격반복으로 복습 (무료 가입 후 이용)');
    expect(text).not.toContain('자동 복습');
  });
});
