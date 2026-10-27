import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/auth/errors';
import { CERT_CANDIDATES, OTHER_CERT_KEY } from './certCandidates';
import { listCerts } from '@/lib/content';
import { REPORT_MESSAGE_MAX, parseCertRequest, parseQuestionReport } from './validate';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return 'no_error';
}

describe('parseQuestionReport', () => {
  it('day 문제와 모의고사 문제 id 를 모두 받는다', () => {
    expect(parseQuestionReport({ questionId: 'saa-c03-w1-d2-q3', reason: 'answer' }).questionId).toBe('saa-c03-w1-d2-q3');
    expect(parseQuestionReport({ questionId: 'exam-saa-c03-12', reason: 'typo' }).questionId).toBe('exam-saa-c03-12');
  });

  it('형식이 아닌 id 와 목록 밖 사유는 거부한다', () => {
    expect(codeOf(() => parseQuestionReport({ questionId: '../x', reason: 'answer' }))).toBe('invalid_question');
    expect(codeOf(() => parseQuestionReport({ questionId: 'saa-c03-w1-d1-q1', reason: 'spam' }))).toBe('invalid_reason');
    expect(codeOf(() => parseQuestionReport(null))).toBe('invalid_question');
  });

  it("'기타'는 내용이 있어야 하고, 다른 사유는 내용 없이도 된다", () => {
    expect(codeOf(() => parseQuestionReport({ questionId: 'saa-c03-w1-d1-q1', reason: 'other', message: '  ' }))).toBe('invalid_message');
    expect(parseQuestionReport({ questionId: 'saa-c03-w1-d1-q1', reason: 'answer' }).message).toBeNull();
  });

  it('내용은 상한에서 자른다', () => {
    const r = parseQuestionReport({ questionId: 'saa-c03-w1-d1-q1', reason: 'other', message: 'x'.repeat(REPORT_MESSAGE_MAX + 50) });
    expect(r.message).toHaveLength(REPORT_MESSAGE_MAX);
  });
});

describe('parseCertRequest', () => {
  it('후보 key 를 받는다', () => {
    expect(parseCertRequest({ certKey: 'sqld' })).toEqual({ certKey: 'sqld', otherName: null });
  });

  it('후보 밖 key 는 거부한다', () => {
    expect(codeOf(() => parseCertRequest({ certKey: 'saa-c03' }))).toBe('invalid_cert');
  });

  it("'기타'는 자격증 이름이 필요하다", () => {
    expect(codeOf(() => parseCertRequest({ certKey: OTHER_CERT_KEY, otherName: 'x' }))).toBe('invalid_cert_name');
    expect(parseCertRequest({ certKey: OTHER_CERT_KEY, otherName: ' 빅데이터분석기사 ' }).otherName).toBe('빅데이터분석기사');
  });

  it('후보에 이미 노트가 있는 자격증이 섞이지 않는다', async () => {
    const existing = new Set((await listCerts('aws-certs')).map((c) => c.slug));
    expect(existing.size).toBeGreaterThan(0);
    for (const c of CERT_CANDIDATES) expect(existing.has(c.key)).toBe(false);
  });
});
