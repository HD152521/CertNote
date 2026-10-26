import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { oauthErrorMessage } from './oauthErrors';

describe('oauthErrorMessage', () => {
  it('has a message for every error code the Google routes redirect with', () => {
    const sources = ['src/app/api/auth/google/route.ts', 'src/app/api/auth/google/callback/route.ts']
      .map((p) => readFileSync(p, 'utf8'))
      .join('\n');
    const codes = new Set([
      ...[...sources.matchAll(/error=([a-z_]+)/g)].map((m) => m[1]),
      ...[...sources.matchAll(/fail\('([a-z_]+)'\)/g)].map((m) => m[1]),
    ]);
    expect(codes.size).toBeGreaterThan(0);
    for (const code of codes) {
      expect(oauthErrorMessage(code, false), code).toBeTruthy();
      expect(oauthErrorMessage(code, true), code).toBeTruthy();
    }
  });

  it('ignores unknown and prototype keys', () => {
    expect(oauthErrorMessage(null, false)).toBeNull();
    expect(oauthErrorMessage('nope', false)).toBeNull();
    expect(oauthErrorMessage('toString', false)).toBeNull();
  });
});
