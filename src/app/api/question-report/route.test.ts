import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  query: vi.fn(),
  rateLimit: vi.fn(),
  getQuestionById: vi.fn(),
}));

vi.mock('@/lib/auth/currentUser', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/db', () => ({ query: mocks.query }));
vi.mock('@/lib/rateLimit', () => ({ clientIp: () => '203.0.113.7', rateLimit: mocks.rateLimit }));
vi.mock('@/lib/questions', () => ({ getQuestionById: mocks.getQuestionById }));

import { POST as reportPOST } from './route';
import { POST as certPOST } from '../cert-request/route';

function req(body: unknown): Request {
  return new Request('http://localhost/api/x', { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockReturnValue({ ok: true, retryAfter: 0 });
  mocks.getCurrentUser.mockResolvedValue(null);
  mocks.getQuestionById.mockReturnValue({ id: 'saa-c03-w1-d1-q1' });
  mocks.query.mockResolvedValue([]);
});

describe('POST /api/question-report', () => {
  it('비로그인 신고를 user_id 없이 저장한다', async () => {
    const res = await reportPOST(req({ questionId: 'saa-c03-w1-d1-q1', reason: 'answer' }));
    expect(res.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO question_reports'), ['saa-c03-w1-d1-q1', null, 'answer', null]);
  });

  it('로그인 사용자면 user_id 를 남긴다', async () => {
    mocks.getCurrentUser.mockResolvedValue({ sub: '42' });
    await reportPOST(req({ questionId: 'saa-c03-w1-d1-q1', reason: 'typo', message: '오타' }));
    expect(mocks.query.mock.calls[0][1]).toEqual(['saa-c03-w1-d1-q1', '42', 'typo', '오타']);
  });

  it('없는 문제는 저장하지 않는다', async () => {
    mocks.getQuestionById.mockReturnValue(undefined);
    const res = await reportPOST(req({ questionId: 'saa-c03-w99-d1-q1', reason: 'answer' }));
    expect(res.status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('레이트리밋에 걸리면 429 이고 저장하지 않는다', async () => {
    mocks.rateLimit.mockReturnValue({ ok: false, retryAfter: 30 });
    const res = await reportPOST(req({ questionId: 'saa-c03-w1-d1-q1', reason: 'answer' }));
    expect(res.status).toBe(429);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe('POST /api/cert-request', () => {
  it('비로그인 요청은 user_id 없이 저장한다', async () => {
    const res = await certPOST(req({ certKey: 'sqld' }));
    expect(res.status).toBe(200);
    expect(mocks.query.mock.calls[0][1]).toEqual(['sqld', null, null]);
  });

  it('잘못된 입력은 400 이고 저장하지 않는다', async () => {
    const res = await certPOST(req({ certKey: 'other', otherName: '' }));
    expect(res.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('이메일은 받지 않고, 로그인 사용자는 계정으로 중복을 거른다', async () => {
    mocks.getCurrentUser.mockResolvedValue({ sub: '7' });
    await certPOST(req({ certKey: 'cka', email: 'someone-else@example.com' }));
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain('NOT EXISTS');
    expect(sql).not.toContain('email');
    expect(params).toEqual(['cka', null, '7']);
  });
});
