import { describe, expect, test } from 'vitest';
import examDataEn from '@/data/exam-questions-en.json';
import { getAllExamQuestions, getDomainLabelsEn, getExamCertSlugs, localizeExamQuestion } from './examBank';
import { buildExam, checkAnswer } from './examService';

// 영어로 전환하면 모의고사 문제·보기·해설·도메인 이름이 모두 영어로 나와야 한다.
// 영어 파일(content/exams-en)에 빠진 문제가 있으면 한국어로 대체되지만, AWS 자격증은 하나도 빠지면 안 된다.

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const en = examDataEn as Record<string, { domain: string; prompt: string; choices: { label: string; text: string }[]; explanation: string }>;
const AWS = getAllExamQuestions().filter((q) => !q.slug.startsWith('linux-') && q.slug !== 'sqld');

describe('모의고사 영어판', () => {
  test('AWS 자격증 문제는 전부 영어판이 있다', () => {
    expect(AWS.length).toBeGreaterThan(700);
    const missing = AWS.filter((q) => !en[q.id]).map((q) => q.id);
    expect(missing, `영어판 없는 문제 ${missing.length}개`).toEqual([]);
  });

  test('영어판에는 한글이 한 글자도 없다', () => {
    const bad: string[] = [];
    for (const [id, q] of Object.entries(en)) {
      const text = [q.domain, q.prompt, q.explanation, ...q.choices.map((c) => c.text)].join('\n');
      if (HANGUL.test(text)) bad.push(id);
    }
    expect(bad).toEqual([]);
  });

  test('영어판의 보기 라벨과 개수가 한국어와 같고 복수 선택 표기가 맞다', () => {
    const wrong: string[] = [];
    for (const q of AWS) {
      const e = en[q.id];
      if (!e) continue;
      if (e.choices.map((c) => c.label).join('') !== q.choices.map((c) => c.label).join('')) wrong.push(`${q.id} 보기`);
      const n = q.answer.split(',').filter((x) => x.trim()).length;
      const hint = e.prompt.match(/\(Select (TWO|THREE|FOUR)\.\)\s*$/);
      if (n > 1 && !hint) wrong.push(`${q.id} 복수 표기 없음`);
      if (n === 1 && hint) wrong.push(`${q.id} 단일인데 복수 표기`);
    }
    expect(wrong).toEqual([]);
  });

  test('같은 한국어 도메인은 영어 이름도 하나다', () => {
    const seen = new Map<string, string>();
    const conflicts: string[] = [];
    for (const q of AWS) {
      const e = en[q.id];
      if (!e) continue;
      const key = `${q.slug}::${q.domain}`;
      const prev = seen.get(key);
      if (prev && prev !== e.domain) conflicts.push(`${key}: ${prev} / ${e.domain}`);
      seen.set(key, e.domain);
    }
    expect(conflicts).toEqual([]);
  });

  test('영어 모드의 출제는 영어 문제와 도메인 이름을 내려주고 도메인 키는 그대로 한국어다', () => {
    const slug = getExamCertSlugs().find((s) => s === 'saa-c03') ?? AWS[0].slug;
    const [q] = buildExam(slug, 1, [], 'en');
    expect(HANGUL.test(q.prompt)).toBe(false);
    expect(HANGUL.test(q.domainLabel)).toBe(false);
    expect(HANGUL.test(q.domain)).toBe(true);
    const ko = buildExam(slug, 1, [], 'ko')[0];
    expect(HANGUL.test(ko.prompt)).toBe(true);
    expect(ko.domainLabel).toBe(ko.domain);
  });

  test('연습 모드 해설도 영어로 나오고 정답은 언어와 상관없이 같다', () => {
    const q = AWS.find((x) => x.slug === 'saa-c03' && !x.answer.includes(','))!;
    const koRes = checkAnswer(q.id, q.answer, 'ko')!;
    const enRes = checkAnswer(q.id, q.answer, 'en')!;
    expect(enRes.correct).toBe(true);
    expect(enRes.answer).toBe(koRes.answer);
    expect(HANGUL.test(enRes.explanation)).toBe(false);
    expect(HANGUL.test(koRes.explanation)).toBe(true);
  });

  test('SQLD·리눅스마스터 문제도 영어판이 있어 영어로 나온다', () => {
    for (const slug of ['sqld', 'linux-master-1']) {
      const q = getAllExamQuestions().find((x) => x.slug === slug)!;
      const loc = localizeExamQuestion(q, 'en');
      expect(HANGUL.test([loc.prompt, loc.domainLabel, ...loc.choices.map((c) => c.text)].join(' ')), slug).toBe(false);
    }
  });

  test('설정 화면용 영어 도메인 이름이 자격증의 모든 도메인을 덮는다', () => {
    const labels = getDomainLabelsEn('saa-c03');
    const domains = new Set(AWS.filter((q) => q.slug === 'saa-c03').map((q) => q.domain));
    for (const d of domains) expect(labels[d], d).toBeTruthy();
  });
});
