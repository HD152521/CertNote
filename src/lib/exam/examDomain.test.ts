import { beforeEach, describe, expect, it, vi } from 'vitest';

const record = vi.fn();
vi.mock('../quiz/attemptService', () => ({ getAttemptService: () => ({ record }) }));

import { buildExam, checkAnswer, gradeExam, summarizeByDomain, type ExamResultItem } from './examService';
import { getExamQuestionsByCert } from './examBank';

const item = (slug: string, domain: string, correct: boolean, selected: string | null = 'A'): ExamResultItem => ({
  questionId: `${slug}-${domain}-${Math.random()}`, number: 1, prompt: '', choices: [], slug, domain, multi: false,
  selected, correct, answer: 'A', explanation: '',
});

describe('summarizeByDomain', () => {
  it('groups by cert and domain and sorts the weakest first', () => {
    const rows = summarizeByDomain([
      item('saa-c03', '보안 설계', true), item('saa-c03', '보안 설계', false),
      item('saa-c03', '비용 최적화 설계', true),
      item('saa-c03', '복원력 설계', false), item('saa-c03', '복원력 설계', false, null),
    ]);
    expect(rows.map((r) => [r.domain, r.correct, r.total, r.rate])).toEqual([
      ['복원력 설계', 0, 2, 0],
      ['보안 설계', 1, 2, 50],
      ['비용 최적화 설계', 1, 1, 100],
    ]);
  });

  it('keeps the same domain name from different certs apart', () => {
    const rows = summarizeByDomain([item('clf-c02', '보안', true), item('scs-c03', '보안', false)]);
    expect(rows).toHaveLength(2);
    expect(rows[0].slug).toBe('scs-c03');
  });

  it('returns an empty list for no items', () => {
    expect(summarizeByDomain([])).toEqual([]);
  });
});

describe('gradeExam domains', () => {
  beforeEach(() => record.mockReset());

  it('includes the per-domain summary in the result', async () => {
    const qs = getExamQuestionsByCert('saa-c03').slice(0, 5);
    const result = await gradeExam('u1', qs.map((q) => q.id), { [qs[0].id]: qs[0].answer });
    const total = result.domains.reduce((n, d) => n + d.total, 0);
    expect(total).toBe(5);
    expect(result.domains.reduce((n, d) => n + d.correct, 0)).toBe(result.correct);
  });
});

describe('buildExam domain filter', () => {
  it('only draws from the chosen domains of the cert', () => {
    const qs = buildExam('saa-c03', 100, ['보안 설계']);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.slug === 'saa-c03' && q.domain === '보안 설계')).toBe(true);
  });

  it('ignores domains that do not belong to the cert', () => {
    expect(buildExam('saa-c03', 10, ['없는 도메인'])).toEqual([]);
  });

  it('accepts slug::domain keys when no cert is chosen', () => {
    const qs = buildExam(null, 100, ['saa-c03::보안 설계', 'clf-c02::' + getExamQuestionsByCert('clf-c02')[0].domain]);
    expect(new Set(qs.map((q) => q.slug))).toEqual(new Set(['saa-c03', 'clf-c02']));
  });

  it('keeps the whole cert when the domain list is empty', () => {
    const qs = buildExam('saa-c03', 100, []);
    expect(qs.length).toBe(getExamQuestionsByCert('saa-c03').length);
  });
});

describe('checkAnswer', () => {
  it('returns correctness, answer and explanation for one question', () => {
    const q = getExamQuestionsByCert('saa-c03')[0];
    const ok = checkAnswer(q.id, q.answer);
    expect(ok).toMatchObject({ correct: true, answer: q.answer, explanation: q.explanation });
    const wrong = ['A', 'B', 'C', 'D'].find((l) => !q.answer.includes(l))!;
    expect(checkAnswer(q.id, wrong)?.correct).toBe(false);
  });

  it('returns null for an unknown question or empty selection', () => {
    expect(checkAnswer('exam-nope-1', 'A')).toBeNull();
    const q = getExamQuestionsByCert('saa-c03')[0];
    expect(checkAnswer(q.id, '')).toBeNull();
  });
});
