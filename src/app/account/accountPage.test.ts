import { describe, expect, test, vi } from 'vitest';

// has_password 컬럼이 아직 없는 DB(마이그레이션 전에 새 코드가 먼저 배포된 경우)에서도 마이페이지 SSR 이
// 실패하지 않는지 — 이 컬럼을 직접 SELECT 하면 Postgres 가 오류를 내므로, 그런 쿼리는 여기서 던지게 흉내 낸다.
const query = vi.hoisted(() =>
  vi.fn(async (sql: string) => {
    if (/has_password/.test(sql)) throw new Error('column "has_password" does not exist');
    if (/^\s*SELECT \* FROM users/.test(sql)) {
      // 컬럼이 없는 행 형태 — has_password 키 자체가 없다.
      return [{ id: 7, email: 'me@example.com', password_hash: 'h', token_version: 0, email_verified: true }];
    }
    return [{ name: '홍길동', birthdate: '1990-01-01', occupation: null, target_cert: 'saa-c03', purpose: null, experience_level: null, plan: 'free', period_end: null, days_left: null, email_verified: false }];
  }),
);
vi.mock('@/lib/db', () => ({ query }));
vi.mock('@/lib/auth/currentUser', () => ({
  getCurrentUser: async () => ({ sub: '7', email: 'me@example.com', role: 'user', ver: 0 }),
}));
vi.mock('@/lib/content', () => ({ listCerts: async () => [{ slug: 'saa-c03', code: 'SAA-C03', name: 'SAA' }] }));

const { default: AccountPage } = await import('./page');

describe('마이페이지 SSR — has_password 컬럼 부재', () => {
  test('컬럼이 없어도 데이터 로드가 성공하고 비밀번호 계정(엄격한 쪽)으로 그린다', async () => {
    const el = (await AccountPage({ searchParams: Promise.resolve({}) })) as { props: Record<string, unknown> };
    expect(el.props.hasPassword).toBe(true);
    expect(el.props.emailVerified).toBe(false);
    expect(el.props.userEmail).toBe('me@example.com');
    expect(query.mock.calls.every(([sql]) => !/has_password/.test(String(sql)))).toBe(true);
  });
});

describe('마이페이지 — 없앤 탭 주소', () => {
  test('예전 ?tab=notebook 은 오답노트 페이지로 보낸다', async () => {
    await expect(AccountPage({ searchParams: Promise.resolve({ tab: 'notebook' }) })).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;[a-z]+;\/notebook;/),
    });
  });
});
