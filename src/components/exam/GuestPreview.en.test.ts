// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildExam, checkAnswer } from '@/lib/exam/examService';
import { getExamQuestionsByCert } from '@/lib/exam/examBank';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => createElement('a', { href, ...rest }, children),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

import { GuestPreview } from './GuestPreview';
import { track } from '@/lib/analytics';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const CERT = 'saa-c03';
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let root: Root;
let host: HTMLDivElement;
const bodies: { url: string; lang: string }[] = [];

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  bodies.length = 0;
  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    bodies.push({ url, lang: body.lang });
    if (url === '/api/exam/preview') return Response.json({ questions: buildExam(body.certSlug, 5, [], body.lang) });
    return Response.json(checkAnswer(body.questionId, body.selected, body.lang));
  });
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe('GuestPreview (en)', () => {
  test('영어로 문제를 받아 풀고 결과·가입 CTA 까지 한글 없이 보여 준다', async () => {
    const total = getExamQuestionsByCert(CERT).length;
    act(() => root.render(createElement(GuestPreview, { certSlug: CERT, certCode: 'SAA-C03', totalCount: total, lang: 'en' })));
    await tick();
    expect(bodies[0]).toEqual({ url: '/api/exam/preview', lang: 'en' });
    for (let i = 0; i < 5; i++) {
      expect(HANGUL.test(host.innerHTML)).toBe(false);
      act(() => { host.querySelector<HTMLButtonElement>('ul button')!.click(); });
      const checkBtn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Check answer')!;
      act(() => checkBtn.click());
      await tick();
      expect(HANGUL.test(host.innerHTML)).toBe(false);
      const nextBtn = [...host.querySelectorAll('button')].find((b) => /Next question|See results/.test(b.textContent ?? ''))!;
      act(() => nextBtn.click());
    }
    expect(bodies.filter((b) => b.url.endsWith('/check')).every((b) => b.lang === 'en')).toBe(true);
    expect(HANGUL.test(host.innerHTML)).toBe(false);
    const cta = host.querySelector<HTMLAnchorElement>('a[data-signup-cta]')!;
    expect(cta.textContent).toContain('Create a free account');
    expect(cta.getAttribute('href')).toContain('/signup?lang=en');
    expect(host.textContent).toContain(`${total}-question`);
    act(() => cta.click());
    expect(track).toHaveBeenCalledWith('signup_prompt_click', expect.objectContaining({ placement: 'try_result', lang: 'en' }));
  });
});
