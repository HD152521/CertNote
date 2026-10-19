import { beforeAll, describe, expect, test } from 'vitest';
import { SignJWT } from 'jose';
import { createSessionToken, verifySessionToken } from './session';

const SECRET = 'test-secret-at-least-16-chars';
beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

describe('세션 토큰 iat(발급 시각)', () => {
  test('새 토큰은 iat 를 담고 읽을 때 돌려준다', async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await createSessionToken({ sub: '1', email: 'a@example.com', role: 'user', ver: 2 });
    const s = await verifySessionToken(token);
    expect(s?.ver).toBe(2);
    expect(s?.iat).toBeGreaterThanOrEqual(before - 1);
  });

  test('iat 가 없는 옛 토큰도 그대로 유효하고 iat 만 undefined', async () => {
    const legacy = await new SignJWT({ email: 'a@example.com', role: 'user', ver: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('1')
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode(SECRET));
    const s = await verifySessionToken(legacy);
    expect(s).toMatchObject({ sub: '1', email: 'a@example.com', ver: 0 });
    expect(s?.iat).toBeUndefined();
  });
});
