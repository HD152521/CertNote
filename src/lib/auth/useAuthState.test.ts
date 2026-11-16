import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAuthUser, resetAuthStore } from './useAuthState';

const spy = vi.fn();

beforeEach(() => {
  resetAuthStore();
  spy.mockReset();
  spy.mockImplementation(async () => Response.json({ user: null }));
  vi.stubGlobal('fetch', spy);
});
afterEach(() => vi.unstubAllGlobals());

describe('loadAuthUser', () => {
  it('merges concurrent calls into one request', async () => {
    await Promise.all([loadAuthUser(), loadAuthUser(), loadAuthUser(true)]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('reuses the stored result unless forced', async () => {
    await loadAuthUser();
    await loadAuthUser();
    expect(spy).toHaveBeenCalledTimes(1);
    await loadAuthUser(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it('does not store a failed lookup, so the next call retries', async () => {
    spy.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    expect(await loadAuthUser()).toBeNull();
    await loadAuthUser();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
