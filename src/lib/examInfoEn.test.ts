import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { AWS_EXAM_TIPS, AWS_EXAM_TIPS_EN, getExamInfo, getExamTips, localizeExamInfo } from './examInfo';

// 영어로 전환하면 시험 정보 카드(도메인 이름, 출제 형식, 선수 지식, 언어, FAQ)도 영어로 나와야 한다.

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const AWS_SLUGS = [
  'clf-c02', 'aif-c01', 'saa-c03', 'dva-c02', 'soa-c02', 'dea-c01', 'mla-c01', 'scs-c03', 'mls-c01', 'sap-c02', 'dop-c02',
];

const visibleText = (info: NonNullable<ReturnType<typeof getExamInfo>>): string =>
  [info.difficulty, info.prerequisites, info.format, ...info.languages, ...info.domains.map((d) => d.name), ...(info.faq ?? []).flatMap((f) => [f.q, f.a])]
    .filter((x): x is string => typeof x === 'string')
    .join('\n');

describe('시험 정보 영어판', () => {
  test.each(AWS_SLUGS)('%s: 영어 화면에는 한글이 없고 숫자·URL 은 한국어 정본과 같다', (slug) => {
    const ko = getExamInfo(slug)!;
    const en = localizeExamInfo(ko, slug, 'en');
    expect(HANGUL.test(visibleText(en)), `${slug} 영어 시험 정보에 한글이 남음`).toBe(false);
    expect(en.domains.map((d) => d.weight)).toEqual(ko.domains.map((d) => d.weight));
    expect(en.faq?.length).toBe(ko.faq?.length);
    expect(en.questionCount).toBe(ko.questionCount);
    expect(en.costUsd).toBe(ko.costUsd);
    expect(en.officialUrl).toBe(ko.officialUrl);
  });

  test('영어 FAQ 는 한국어 FAQ 와 같은 숫자를 말한다', () => {
    for (const slug of AWS_SLUGS) {
      const ko = getExamInfo(slug)!;
      const en = localizeExamInfo(ko, slug, 'en');
      const nums = (s: string): string[] => (s.match(/\d+/g) ?? []).sort();
      (ko.faq ?? []).forEach((f, i) => {
        expect(nums(en.faq![i].a), `${slug} FAQ ${i + 1} 숫자`).toEqual(nums(f.a));
      });
    }
  });

  test('한국어 화면은 영어 파일의 영향을 받지 않는다', () => {
    const ko = getExamInfo('saa-c03')!;
    expect(localizeExamInfo(ko, 'saa-c03', 'ko')).toBe(ko);
    expect(HANGUL.test(visibleText(ko))).toBe(true);
  });

  test('영어 파일이 없는 시험(SQLD 등)은 한국어 정본을 그대로 돌려준다', () => {
    const sqld = getExamInfo('sqld')!;
    expect(localizeExamInfo(sqld, 'sqld', 'en')).toEqual(sqld);
  });

  test('영어 파일에는 정본 외의 필드(숫자·URL)가 없다', () => {
    for (const slug of AWS_SLUGS) {
      const raw = JSON.parse(readFileSync(path.join(process.cwd(), 'content', 'exam-info-en', `${slug}.json`), 'utf8')) as Record<string, unknown>;
      const allowed = new Set(['difficulty', 'prerequisites', 'format', 'languages', 'domains', 'faq']);
      expect(Object.keys(raw).filter((k) => !allowed.has(k)), slug).toEqual([]);
    }
  });

  test('혜택 팁도 영어판이 있고 개수가 같다', () => {
    expect(AWS_EXAM_TIPS_EN.length).toBe(AWS_EXAM_TIPS.length);
    expect(AWS_EXAM_TIPS_EN.some((t) => HANGUL.test(t))).toBe(false);
    expect(getExamTips('aws', 'en')).toBe(AWS_EXAM_TIPS_EN);
    expect(getExamTips('aws', 'ko')).toBe(AWS_EXAM_TIPS);
    expect(getExamTips('linux', 'en')).toEqual([]);
  });
});
