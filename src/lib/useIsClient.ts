import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

// 서버·하이드레이션 중에는 false, 하이드레이션 이후 클라이언트에서는 true.
// effect + setState 없이 "마운트 후" 분기를 만든다.
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
