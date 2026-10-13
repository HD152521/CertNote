import { NextRequest } from 'next/server';
import { describe, expect, test } from 'vitest';
import { proxy } from '@/proxy';
import { getAllDays } from '@/lib/content';
import { unpresentableEnDayRedirect } from './enRedirect';
import { enPresentableWeek } from './presentable';

// 한도 밖 영어 day 의 직접 접근 정책(프록시에서 307 → 한국어 같은 day). 한도는 파일에서 도출되므로 상대값으로 단언한다.
const slug = 'saa-c03';
const beyond = () => enPresentableWeek(slug) + 1;

describe('unpresentableEnDayRedirect — 결정', () => {
  test('한도 밖(파일은 있는) 영어 day → 같은 day 의 한국어 섹션 URL', async () => {
    const w = beyond();
    expect(await unpresentableEnDayRedirect(`/en/${slug}/week${w}/day1`)).toBe(`/aws/${slug}/week${w}/day1`);
  });

  test('한도 이하 영어 day 는 리다이렉트하지 않는다(week1 포함)', async () => {
    expect(await unpresentableEnDayRedirect(`/en/${slug}/week1/day1`)).toBeNull();
    expect(await unpresentableEnDayRedirect(`/en/${slug}/week${enPresentableWeek(slug)}/day2`)).toBeNull();
  });

  test('영어 day 가 아닌 경로·비정규 세그먼트·다른 깊이는 건드리지 않는다', async () => {
    const w = beyond();
    for (const p of [
      `/aws/${slug}/week${w}/day1`, `/linux/linux-master-1/week2/day1`, `/en/${slug}`, '/en', '/',
      `/en/${slug}/week0${w}/day1`, `/en/${slug}/week${w}/day01`, `/en/${slug}/week${w}/dayX`,
      `/en/${slug}/week${w}/day1/extra`, `/en/${slug}/${w}/day1`,
    ]) {
      expect(await unpresentableEnDayRedirect(p), p).toBeNull();
    }
  });

  test('한국어 짝이 없는 day 는 한국어 허브로 보낸다(404·루프 없음)', async () => {
    // 영어에만 있는 day 는 현재 콘텐츠에 없으므로 존재하지 않는 day 번호로 분기를 확인한다.
    const all = await getAllDays('aws', slug);
    const missingDay = Math.max(...all.map((d) => d.day)) + 1;
    expect(await unpresentableEnDayRedirect(`/en/${slug}/week${beyond()}/day${missingDay}`)).toBe(`/aws/${slug}`);
  });
});

describe('proxy — 실제 응답', () => {
  const req = (p: string) => new NextRequest(new URL(p, 'http://localhost:3000'));

  test('한도 밖 영어 day 는 307 + Location(한국어 day) + no-store, 두 번 요청해도 같다', async () => {
    const w = beyond();
    for (const attempt of [1, 2]) {
      const res = await proxy(req(`/en/${slug}/week${w}/day1`));
      expect(res.status, `시도 ${attempt}`).toBe(307);
      expect(new URL(res.headers.get('location')!).pathname).toBe(`/aws/${slug}/week${w}/day1`);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  test('한도 이하 영어 day 는 그대로 통과한다(리다이렉트·리라이트 헤더 없음)', async () => {
    const res = await proxy(req(`/en/${slug}/week1/day1`));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });

  test('존재하지 않는 영어 day 는 리다이렉트가 아니라 404 마커로 리라이트된다', async () => {
    for (const p of [`/en/${slug}/week${beyond()}/day999`, `/en/${slug}/week99/day1`, '/en/nope-c99/week1/day1']) {
      const res = await proxy(req(p));
      expect(res.status, p).not.toBe(307);
      expect(res.headers.get('location'), p).toBeNull();
      expect(res.headers.get('x-middleware-rewrite') ?? '', p).toContain('__not-found__');
    }
  });

  test('한국어 day 는 영향이 없다', async () => {
    const res = await proxy(req(`/aws/${slug}/week${beyond()}/day1`));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});
