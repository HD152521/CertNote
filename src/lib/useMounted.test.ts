import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useClientValue, useMounted } from './useMounted';

// 서버 렌더에서 이 훅들이 "브라우저 값"을 내보내면 서버 HTML 과 클라이언트 첫 렌더가 달라져
// 하이드레이션이 어긋난다(테마 아이콘·모바일 내비 포털·단축키 표기). 서버 값이 고정인지 지킨다.
function MountedProbe() {
  return createElement('span', null, useMounted() ? 'mounted' : 'server');
}

function ClientValueProbe() {
  return createElement('span', null, useClientValue(() => 'client', 'server'));
}

describe('useMounted', () => {
  it('서버 렌더에서는 false 다', () => {
    const html = renderToString(createElement(MountedProbe));

    expect(html).toContain('server');
    expect(html).not.toContain('mounted');
  });
});

describe('useClientValue', () => {
  it('서버 렌더에서는 serverValue 를 쓴다', () => {
    const html = renderToString(createElement(ClientValueProbe));

    expect(html).toContain('server');
    expect(html).not.toContain('client');
  });
});
