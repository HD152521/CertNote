import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

// 광고 컴포넌트의 "렌더하느냐 마느냐" 만 본다. vitest 는 node 환경이라 마운트 뒤의
// adsbygoogle.push() 는 여기서 돌지 않는다(브라우저 확인은 Step 9 검증 기록 참고).
const nav = vi.hoisted(() => ({ segments: [] as string[], pathname: '/' as string | null }));
vi.mock('next/navigation', () => ({
  useSelectedLayoutSegments: () => nav.segments,
  usePathname: () => nav.pathname,
}));
vi.mock('@/lib/i18n-client', () => ({ useLanguage: () => 'ko' }));

import { AdSenseLoader } from './AdSenseLoader';
import { AdSlot } from './AdSlot';

const CLIENT = 'ca-pub-0000000000000000';
const AD_MARKUP = /adsbygoogle|pagead2|googlesyndication/;

function setRoute(segments: string[], pathname: string | null = `/${segments.join('/')}`) {
  nav.segments = segments;
  nav.pathname = pathname;
}

afterEach(() => {
  vi.unstubAllEnvs();
  setRoute([]);
});

describe('AdSenseLoader', () => {
  test('게시자 ID 가 없으면 아무것도 렌더하지 않는다', () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', '');
    setRoute(['aws', 'saa-c03']);

    expect(renderToStaticMarkup(createElement(AdSenseLoader))).toBe('');
  });

  test('게시자 ID 형식이 틀리면 아무것도 렌더하지 않는다', () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', 'ca-pub-123');
    setRoute([]);

    expect(renderToStaticMarkup(createElement(AdSenseLoader))).toBe('');
  });

  test.each([[[]], [['aws']], [['aws', 'saa-c03', 'week2', 'day1']], [['en']], [['roadmap']]])(
    '공개 라우트 %j 에는 async 로더 스크립트를 하나 렌더한다',
    (segments) => {
      vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', CLIENT);
      setRoute(segments);

      const html = renderToStaticMarkup(createElement(AdSenseLoader));

      expect(html.match(/<script/g)).toHaveLength(1);
      expect(html).toContain(
        `src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}"`,
      );
      expect(html).toContain('async');
      expect(html).toContain('crossorigin="anonymous"');
    },
  );

  test.each([[['login']], [['signup']], [['dashboard']], [['exam', 'saa-c03']], [['account']], [['admin', 'users']], [['pricing']], [['checkout']]])(
    '제외 라우트 %j 에는 렌더하지 않는다',
    (segments) => {
      vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', CLIENT);
      setRoute(segments);

      expect(renderToStaticMarkup(createElement(AdSenseLoader))).toBe('');
    },
  );

  test('주소가 / 여도 렌더된 라우트가 /home(로그인 사용자의 학습 홈)이면 렌더하지 않는다', () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', CLIENT);
    setRoute(['home'], '/');

    expect(renderToStaticMarkup(createElement(AdSenseLoader))).toBe('');
  });
});

describe('AdSlot', () => {
  test('게시자 ID 가 없으면 아무것도 렌더하지 않는다', () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', '');
    setRoute(['aws']);

    expect(renderToStaticMarkup(createElement(AdSlot, { slot: '1234567890' }))).toBe('');
  });

  test.each([[''], ['abc'], [undefined]])('슬롯 ID 가 %j 이면 아무것도 렌더하지 않는다', (slot) => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', CLIENT);
    setRoute(['aws']);

    expect(renderToStaticMarkup(createElement(AdSlot, { slot }))).toBe('');
  });

  test('제외 경로에서는 아무것도 렌더하지 않는다', () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', CLIENT);
    setRoute(['login']);

    expect(renderToStaticMarkup(createElement(AdSlot, { slot: '1234567890' }))).not.toMatch(AD_MARKUP);
  });

  test('공개 경로에서는 광고 레이블이 붙은 영역 안에 ins.adsbygoogle 을 렌더한다', () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', CLIENT);
    setRoute(['aws', 'saa-c03']);

    const html = renderToStaticMarkup(createElement(AdSlot, { slot: '1234567890' }));

    expect(html).toContain('aria-label="광고"');
    expect(html.match(/<ins/g)).toHaveLength(1);
    expect(html).toContain('class="adsbygoogle"');
    expect(html).toContain(`data-ad-client="${CLIENT}"`);
    expect(html).toContain('data-ad-slot="1234567890"');
    expect(html).toContain('data-ad-format="auto"');
    expect(html).toContain('data-full-width-responsive="true"');
    expect(html).not.toContain('min-height');
  });

  test('minHeight 를 주면 광고가 뜨기 전에도 그 높이를 차지한다', () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', CLIENT);
    setRoute(['aws', 'saa-c03']);

    const html = renderToStaticMarkup(createElement(AdSlot, { slot: '1234567890', minHeight: 280 }));

    expect(html).toContain('min-height:280px');
  });

  test('format·layout 을 data 속성으로 넘긴다', () => {
    vi.stubEnv('NEXT_PUBLIC_ADSENSE_CLIENT', CLIENT);
    setRoute(['aws', 'saa-c03']);

    const html = renderToStaticMarkup(
      createElement(AdSlot, { slot: '1234567890', format: 'fluid', layout: 'in-article' }),
    );

    expect(html).toContain('data-ad-format="fluid"');
    expect(html).toContain('data-ad-layout="in-article"');
    // 반응형 전체 폭 확장은 auto 형식 전용이다.
    expect(html).not.toContain('data-full-width-responsive');
  });
});
