'use client';

import { useSyncExternalStore } from 'react';

// 구독할 것이 없다 — 값이 바뀌는 순간은 "하이드레이션이 끝났다" 한 번뿐이고 그건 React 가 알아서 다시 그린다.
const subscribeNothing = (): (() => void) => () => {};

/**
 * 브라우저에서만 알 수 있는 값을 읽는다. 서버와 하이드레이션 첫 렌더에서는 `serverValue` 를 쓰고,
 * 하이드레이션이 끝나면 `readOnClient()` 로 바꿔 그린다.
 *
 * effect 에서 setState 로 옮기는 방식과 화면 결과가 같다 — 서버 HTML 과 클라이언트 첫 렌더가 같아
 * 하이드레이션이 어긋나지 않는다. `readOnClient` 는 매번 같은 원시값을 돌려줘야 한다.
 */
export function useClientValue<T>(readOnClient: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNothing, readOnClient, () => serverValue);
}

const readMounted = (): boolean => true;

/** 서버·하이드레이션 첫 렌더에서는 false, 그 뒤로는 true. 포털·테마 아이콘처럼 브라우저에서만 그릴 것에 쓴다. */
export function useMounted(): boolean {
  return useClientValue(readMounted, false);
}
