/* Cert Notes 서비스워커
 * - 오프라인: 방문한 페이지/정적 자원을 런타임 캐시(네트워크 우선 + 캐시 폴백)
 * - 푸시: 복습/복귀 알림 수신 표시, 클릭 시 해당 경로로 이동
 * 캐시 버전을 올리면(아래 CACHE) 활성화 시 옛 캐시를 정리한다.
 */
const CACHE = 'certnotes-v1';
const OFFLINE_FALLBACK = '/';

self.addEventListener('install', (event) => {
  // 새 워커를 즉시 대기 없이 활성화.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// GET만 캐시. API/인증 응답은 캐시하지 않는다(개인화·민감).
function isCacheable(url) {
  return !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/_next/data');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !isCacheable(url)) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        // 성공 응답만 캐시 갱신(불투명/에러 제외).
        if (fresh && fresh.status === 200 && fresh.type === 'basic') {
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const fallback = await caches.match(OFFLINE_FALLBACK);
          if (fallback) return fallback;
        }
        throw new Error('offline and not cached');
      }
    })(),
  );
});

// 푸시 수신 → 알림 표시. payload는 { title, body, url, tag } JSON.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Cert Notes';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'certnotes',
    data: { url: data.url || '/review' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 → 이미 열린 탭이 있으면 포커스, 없으면 새로 연다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/review';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
