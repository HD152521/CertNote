import { afterEach, describe, expect, test, vi } from 'vitest';
import { GET } from './route';

describe('/ads.txt', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('게시자 ID 가 유효하면 200 text/plain 으로 한 줄을 낸다', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', 'ca-pub-0000000000000000');

    const res = GET();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await res.text()).toBe('google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0');
  });

  test.each([
    ['없으면', ''],
    ['형식이 틀리면', 'pub-0000000000000000'],
  ])('게시자 ID 가 %s 404', async (_name, value) => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', value);

    const res = GET();

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('google.com');
  });
});
