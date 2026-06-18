// 브라우저 측 푸시 구독 헬퍼. 'use client' 컴포넌트에서만 호출한다.
import type { NotifPrefs } from './types';

// 푸시 지원 여부(서비스워커 + PushManager + Notification).
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function permissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

// VAPID 공개키(base64url) → Uint8Array. PushManager.subscribe의 applicationServerKey 형식.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  // applicationServerKey는 ArrayBuffer 백킹 BufferSource를 요구하므로 명시 할당.
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// 권한 요청 → 구독 생성 → 서버 저장. 성공 시 true.
// 실패(미지원/권한 거부/네트워크)는 false로 수렴하고 throw하지 않는다(UI가 안내).
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return { ok: false, reason: 'no_key' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) return { ok: false, reason: 'save_failed' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'subscribe_failed' };
  }
}

// 이 기기의 구독 해지 + 서버에서 제거.
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
  } catch {
    /* 무시 */
  }
}

// 이 기기가 현재 푸시 구독 중인지(권한 granted + 활성 구독 존재).
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}

export async function fetchPrefs(): Promise<NotifPrefs | null> {
  try {
    const res = await fetch('/api/push/prefs', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.prefs ?? null;
  } catch {
    return null;
  }
}

export async function savePrefs(patch: Partial<NotifPrefs>): Promise<boolean> {
  try {
    const res = await fetch('/api/push/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}
