import { test as setup, expect } from '@playwright/test';
import { E2E_FREE, E2E_PRO, E2E_UNVERIFIED } from './global-setup';

// 유저당 1회만 로그인해 세션 쿠키를 저장한다(테스트마다 로그인하면 5회/분 레이트리밋에 걸린다).
setup('free 계정 로그인 상태 저장', async ({ request }) => {
  const res = await request.post('/api/auth/login', { data: E2E_FREE });
  expect(res.ok(), `free 로그인 실패: ${res.status()}`).toBe(true);
  await request.storageState({ path: 'e2e/.auth/free.json' });
});

setup('pro 계정 로그인 상태 저장', async ({ request }) => {
  const res = await request.post('/api/auth/login', { data: E2E_PRO });
  expect(res.ok(), `pro 로그인 실패: ${res.status()}`).toBe(true);
  await request.storageState({ path: 'e2e/.auth/pro.json' });
});

setup('unverified 계정 로그인 상태 저장', async ({ request }) => {
  const res = await request.post('/api/auth/login', { data: E2E_UNVERIFIED });
  expect(res.ok(), `unverified 로그인 실패: ${res.status()}`).toBe(true);
  await request.storageState({ path: 'e2e/.auth/unverified.json' });
});
