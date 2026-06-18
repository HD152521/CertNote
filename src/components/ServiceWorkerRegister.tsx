'use client';

import { useEffect } from 'react';

// /sw.js를 등록한다. 렌더링하는 것은 없고 마운트 시 1회 등록만 수행.
// 등록 실패(미지원 브라우저 등)는 조용히 무시 — PWA는 점진적 향상이라 앱 동작에 영향 없음.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* 등록 실패는 무시 */
      });
    };
    // 마운트 시점에 이미 load가 끝났으면 'load'는 다시 안 뜬다 → 즉시 등록.
    // 아직 로딩 중이면 load 이후 등록(초기 페인트 경쟁 회피).
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
