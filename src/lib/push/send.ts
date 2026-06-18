import webpush from 'web-push';
import { deleteSubscriptionByEndpoint, listSubscriptions } from './pushRepository';
import type { PushPayload, StoredSubscription } from './types';

let configured = false;

// VAPID 설정은 1회만. 키가 없으면 설정 불가(발송은 조용히 건너뜀).
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!publicKey || !privateKey) {
    console.error('[push] VAPID 키 미설정 — 발송을 건너뜁니다.');
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

// 단일 구독 발송. 만료(404/410) 시 DB에서 정리하고 false 반환.
async function sendToSubscription(sub: StoredSubscription, payload: PushPayload): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return true;
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) {
      // 구독이 더 이상 유효하지 않음 → 정리.
      await deleteSubscriptionByEndpoint(sub.endpoint);
    } else {
      console.error('[push] 발송 실패:', status ?? err);
    }
    return false;
  }
}

// 한 사용자의 모든 기기로 발송. 성공 건수를 반환.
export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subs = await listSubscriptions(userId);
  if (subs.length === 0) return 0;
  const results = await Promise.all(subs.map((s) => sendToSubscription(s, payload)));
  return results.filter(Boolean).length;
}
