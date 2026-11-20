// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getSignupPromptStrings, signupPromptStrings } from '@/lib/strings/signupPrompt';
import { resetAuthStore } from '@/lib/auth/useAuthState';

let pathname = '/en/saa-c03/week1/day1';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, rel, onClick, ...rest }: { href: string; children: React.ReactNode; rel?: string; onClick?: () => void; 'data-signup-cta'?: boolean }) =>
    createElement('a', { href, rel, onClick, 'data-signup-cta': rest['data-signup-cta'] ? '' : undefined }, children),
}));
const track = vi.fn();
vi.mock('@/lib/analytics', () => ({ track: (...a: unknown[]) => track(...a) }));

import { SignupPrompt } from './SignupPrompt';
import { QuizSignupPrompt } from './QuizSignupPrompt';
import { announceQuizAnswered } from '@/lib/quiz/answeredEvent';
import { DISMISS_KEY } from '@/lib/signupPrompt/dismissal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const HANGUL = /[ㄱ-ㆎ가-힣]/;

let root: Root;
let host: HTMLDivElement;

function me(user: unknown) {
  vi.stubGlobal('fetch', async () => Response.json({ user }));
}
async function mount(node: React.ReactElement) {
  await act(async () => {
    root.render(node);
  });
  await act(async () => {});
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  localStorage.clear();
  track.mockClear();
  resetAuthStore();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('SignupPrompt', () => {
  test('anonymous English page: English copy, authHref link with safe next, no Hangul', async () => {
    me(null);
    await mount(createElement(SignupPrompt, { placement: 'hub', message: 'home' }));
    const a = host.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('/signup?lang=en&next=%2Fen%2Fsaa-c03%2Fweek1%2Fday1');
    expect(a.getAttribute('rel')).toBe('nofollow');
    expect(host.textContent).not.toMatch(HANGUL);
    expect(host.querySelector('button')!.getAttribute('aria-label')).toBe('Hide for today');
    expect(track).toHaveBeenCalledWith('signup_prompt_view', { placement: 'hub', lang: 'en' });
  });

  test('anonymous Korean page: Korean copy and Korean next', async () => {
    pathname = '/aws/saa-c03/week1/day1';
    me(null);
    await mount(createElement(SignupPrompt, { placement: 'lab_done', message: 'labDone' }));
    expect(host.querySelector('a')!.getAttribute('href')).toBe('/signup?next=%2Faws%2Fsaa-c03%2Fweek1%2Fday1');
    expect(host.textContent).toContain(signupPromptStrings.ko.labDone);
    expect(host.querySelector('[data-signup-cta]')).not.toBeNull();
    pathname = '/en/saa-c03/week1/day1';
  });

  test('logged-in users see nothing and nothing is tracked', async () => {
    me({ id: 'u1' });
    await mount(createElement(SignupPrompt, { placement: 'hub', message: 'home' }));
    expect(host.querySelector('aside')).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  test('failed auth lookup shows nothing', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    await mount(createElement(SignupPrompt, { placement: 'hub', message: 'home' }));
    expect(host.querySelector('aside')).toBeNull();
  });

  test('dismiss hides it, persists, and tracks', async () => {
    me(null);
    await mount(createElement(SignupPrompt, { placement: 'hub', message: 'home' }));
    await act(async () => {
      host.querySelector('button')!.click();
    });
    expect(host.querySelector('aside')).toBeNull();
    expect(localStorage.getItem(DISMISS_KEY)).not.toBeNull();
    expect(track).toHaveBeenCalledWith('signup_prompt_dismiss', { placement: 'hub', lang: 'en' });
    // next visit: the stored record keeps it hidden from the start
    act(() => root.unmount());
    root = createRoot(host);
    await mount(createElement(SignupPrompt, { placement: 'en_home', message: 'home' }));
    expect(host.querySelector('aside')).toBeNull();
  });

  test('click is tracked with placement and lang', async () => {
    me(null);
    await mount(createElement(SignupPrompt, { placement: 'en_home', message: 'home' }));
    await act(async () => {
      host.querySelector('a')!.click();
    });
    expect(track).toHaveBeenCalledWith('signup_prompt_click', { placement: 'en_home', lang: 'en' });
  });

  test('quiz prompt appears only after a question is answered', async () => {
    me(null);
    await mount(createElement(QuizSignupPrompt));
    expect(host.querySelector('aside')).toBeNull();
    await act(async () => {
      announceQuizAnswered();
    });
    expect(host.querySelector('aside')).not.toBeNull();
  });

  test('quiz prompt does not call /api/auth/me before it is active', async () => {
    const spy = vi.fn(async () => Response.json({ user: null }));
    vi.stubGlobal('fetch', spy);
    await mount(createElement(QuizSignupPrompt));
    expect(spy).not.toHaveBeenCalled();
    await act(async () => {
      announceQuizAnswered();
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('concurrent prompts share one /api/auth/me request', async () => {
    const spy = vi.fn(async () => Response.json({ user: null }));
    vi.stubGlobal('fetch', spy);
    await mount(
      createElement('div', null, createElement(SignupPrompt, { placement: 'hub', message: 'home' }), createElement(SignupPrompt, { placement: 'en_home', message: 'home' })),
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('action-triggered prompts live in a status region labelled by a dedicated string', async () => {
    me(null);
    await mount(createElement(QuizSignupPrompt));
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    await act(async () => {
      announceQuizAnswered();
    });
    expect(host.querySelector('[role="status"] aside')!.getAttribute('aria-label')).toBe('Create an account');
  });

  test('Escape dismisses and focus moves to the preceding focusable element', async () => {
    me(null);
    const before = document.createElement('button');
    before.textContent = 'Try again';
    host.before(before);
    await mount(createElement(SignupPrompt, { placement: 'lab_done', message: 'labDone' }));
    const aside = host.querySelector('aside')!;
    await act(async () => {
      aside.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('aside')).toBeNull();
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  test('English strings contain no Hangul', () => {
    for (const v of Object.values(signupPromptStrings.en)) expect(v).not.toMatch(HANGUL);
  });

  test('the word free appears only while the paywall is off, and only on the button', () => {
    expect(getSignupPromptStrings('en', false).cta).toBe('Create a free account');
    expect(getSignupPromptStrings('ko', false).cta).toBe('무료로 가입하기');
    expect(getSignupPromptStrings('en', true).cta).toBe('Create an account');
    expect(getSignupPromptStrings('ko', true).cta).toBe('가입하기');
    for (const lang of ['ko', 'en'] as const) {
      const r = getSignupPromptStrings(lang, true);
      for (const v of Object.values(r)) expect(v).not.toMatch(/free|무료/i);
    }
    for (const k of ['quizAnswered', 'labDone', 'home'] as const) {
      expect(signupPromptStrings.ko[k]).not.toMatch(/무료/);
      expect(signupPromptStrings.en[k]).not.toMatch(/free/i);
    }
  });

  test('lab copy talks about neither wrong answers nor (in English) mock exams', () => {
    expect(signupPromptStrings.en.labDone).not.toMatch(/wrong|mock/i);
    expect(signupPromptStrings.ko.labDone).not.toMatch(/오답/);
    expect(signupPromptStrings.en.home).not.toMatch(/mock/i);
  });
});
