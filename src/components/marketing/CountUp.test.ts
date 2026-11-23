// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CountUp } from './CountUp';
import { COUNT_UP_MS, formatFigure, isAnimatable, valueAt } from './countUpFormat';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KO = { locale: 'ko-KR' };

function mockMatchMedia(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia;
}

describe('formatFigure / valueAt', () => {
  it('접두·접미·쉼표를 한 함수로 만든다(서버·클라이언트 공용)', () => {
    expect(formatFigure(4439, { ...KO, suffix: '+' })).toBe('4,439+');
    expect(formatFigure(0, { ...KO, prefix: '₩' })).toBe('₩0');
    expect(formatFigure(1234, { locale: 'en-US' })).toBe('1,234');
  });

  it('끝에서는 정확히 최종값이고 중간은 최종값 이하로 단조 증가한다', () => {
    expect(valueAt(0, 792)).toBe(0);
    expect(valueAt(COUNT_UP_MS, 792)).toBe(792);
    expect(valueAt(COUNT_UP_MS * 5, 792)).toBe(792);
    let prev = -1;
    for (let t = 0; t <= COUNT_UP_MS; t += 50) {
      const v = valueAt(t, 792);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(792);
      prev = v;
    }
  });

  it('0·음수·비숫자는 효과 대상이 아니다', () => {
    expect(isAnimatable(0)).toBe(false);
    expect(isAnimatable(-3)).toBe(false);
    expect(isAnimatable(Number.NaN)).toBe(false);
    expect(isAnimatable(Infinity)).toBe(false);
    expect(isAnimatable(14)).toBe(true);
  });
});

describe('CountUp — 서버 렌더', () => {
  it('서버 HTML 에 최종값 문자열이 그대로 있고 폭이 고정된다', () => {
    const html = renderToStaticMarkup(createElement(CountUp, { value: 4439, suffix: '+', ...KO }));
    expect(html).toContain('>4,439+<');
    expect(html).toContain('min-width:6ch');
    expect(html).toContain('tabular-nums');
  });

  it('₩0 은 그대로 렌더된다', () => {
    const html = renderToStaticMarkup(createElement(CountUp, { value: 0, prefix: '₩', ...KO }));
    expect(html).toContain('>₩0<');
  });
});

describe('CountUp — 클라이언트', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reduced-motion 이면 최종값을 바꾸지 않고 rAF 도 부르지 않는다', async () => {
    mockMatchMedia(true);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(CountUp, { value: 792, suffix: '+', ...KO }));
    });
    expect(host.textContent).toBe('792+');
    expect(raf).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('값이 0 이면 효과 없이 그대로 둔다', async () => {
    mockMatchMedia(false);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(CountUp, { value: 0, prefix: '₩', ...KO }));
    });
    expect(host.textContent).toBe('₩0');
    expect(raf).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  function stubFrames() {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const callbacks: FrameRequestCallback[] = [];
    let nextId = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callbacks.push(cb);
      return ++nextId;
    });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    return { callbacks, cancel, setNow: (n: number) => (now = n) };
  }

  function stubObserver() {
    const instances: { cb: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];
    class FakeObserver {
      disconnect = vi.fn();
      constructor(cb: IntersectionObserverCallback) {
        instances.push({ cb, disconnect: this.disconnect });
      }
      observe() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    return instances;
  }

  it('마운트 시점에 이미 화면 안이면 textContent 를 바꾸지 않고 rAF 도 부르지 않는다', async () => {
    mockMatchMedia(false);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 10, bottom: 40 } as DOMRect);
    const { callbacks } = stubFrames();
    const observers = stubObserver();
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(CountUp, { value: 792, suffix: '+', ...KO }));
    });
    expect(host.textContent).toBe('792+');
    expect(callbacks).toHaveLength(0);
    expect(observers).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it('화면 밖이면 들어올 때 한 번만 0 부터 올라 최종값이 되고, 언마운트하면 rAF 를 취소한다', async () => {
    mockMatchMedia(false);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 5000, bottom: 5030 } as DOMRect);
    const { callbacks, cancel, setNow } = stubFrames();
    const observers = stubObserver();
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(CountUp, { value: 792, suffix: '+', ...KO }));
    });
    expect(host.textContent).toBe('792+');
    expect(callbacks).toHaveLength(0);
    expect(observers).toHaveLength(1);

    observers[0].cb([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(host.textContent).toBe('792+');

    observers[0].cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(host.textContent).toBe('0+');
    expect(observers[0].disconnect).toHaveBeenCalled();
    setNow(COUNT_UP_MS / 2);
    callbacks.shift()?.(COUNT_UP_MS / 2);
    const mid = Number(host.textContent?.replace(/\D/g, ''));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(792);
    setNow(COUNT_UP_MS);
    callbacks.shift()?.(COUNT_UP_MS);
    expect(host.textContent).toBe('792+');
    await act(async () => root.unmount());
    // 마지막으로 예약된 프레임(두 번째 rAF, id 2)을 정확히 취소해야 한다 — 무조건 호출만 보는 약한 단언이 아니다
    expect(cancel).toHaveBeenCalledWith(2);
  });
});

describe('globals.css — 카드 등장 효과', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8');

  it('.card-enter 는 prefers-reduced-motion: no-preference 안에서만 animation 을 건다', () => {
    const occurrences = css.match(/\.card-enter\s*\{[^}]*\}/g) ?? [];
    expect(occurrences).toHaveLength(1);
    const block = css.match(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.card-enter\s*\{[^}]*animation:[^}]*both[^}]*\}\s*\}/);
    expect(block, 'no-preference 미디어 쿼리 안의 .card-enter').toBeTruthy();
    expect(css.match(/animation:\s*card-in/g)).toHaveLength(1);
  });

  it('지속 0.4초 이내, translateY 8px', () => {
    expect(css).toMatch(/animation: card-in 0\.4s/);
    expect(css).toMatch(/@keyframes card-in[\s\S]*translateY\(8px\)/);
  });

  it('히어로 컴포넌트에는 card-enter 를 쓰지 않는다', () => {
    for (const f of ['HomeHero.tsx', 'HeroSlot.tsx']) {
      expect(readFileSync(join(process.cwd(), 'src/components/marketing', f), 'utf-8')).not.toContain('card-enter');
    }
  });
});

describe('홈 — 숫자 띠', () => {
  it('Landing 이 CountUp 을 쓴다(영어 홈에는 숫자 띠가 없다)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/marketing/Landing.tsx'), 'utf-8');
    expect(src).toContain("from '@/components/marketing/CountUp'");
    expect(src).toContain('<CountUp');
  });
});
