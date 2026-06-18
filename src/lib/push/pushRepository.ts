import { query } from '../db';
import type { NotifPrefs, PushSubscriptionInput, StoredSubscription } from './types';

const MIN_HOUR = 0;
const MAX_HOUR = 23;
const DEFAULT_HOUR = 8;

// 구독 저장(upsert). 동일 endpoint 재구독 시 키/소유자만 갱신.
export async function saveSubscription(userId: string, sub: PushSubscriptionInput): Promise<void> {
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint)
     DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
  );
}

export async function deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
  await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

export async function listSubscriptions(userId: string): Promise<StoredSubscription[]> {
  return query<StoredSubscription>(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId],
  );
}

interface PrefsRow {
  notify_review: boolean;
  notify_inactive: boolean;
  reminder_hour: number;
}

export async function getPrefs(userId: string): Promise<NotifPrefs | null> {
  const rows = await query<PrefsRow>(
    'SELECT notify_review, notify_inactive, reminder_hour FROM users WHERE id = $1',
    [userId],
  );
  if (!rows[0]) return null;
  return {
    notifyReview: rows[0].notify_review,
    notifyInactive: rows[0].notify_inactive,
    reminderHour: rows[0].reminder_hour ?? DEFAULT_HOUR,
  };
}

// 부분 갱신. 전달된 필드만 바꾼다. reminderHour는 0~23로 클램프.
export async function updatePrefs(userId: string, patch: Partial<NotifPrefs>): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.notifyReview !== undefined) { sets.push(`notify_review = $${i++}`); vals.push(patch.notifyReview); }
  if (patch.notifyInactive !== undefined) { sets.push(`notify_inactive = $${i++}`); vals.push(patch.notifyInactive); }
  if (patch.reminderHour !== undefined) {
    const h = Math.min(MAX_HOUR, Math.max(MIN_HOUR, Math.trunc(patch.reminderHour)));
    sets.push(`reminder_hour = $${i++}`);
    vals.push(h);
  }
  if (sets.length === 0) return;
  vals.push(userId);
  await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, vals);
}

// 마지막 방문 시각 갱신(스로틀: 1시간 내 재방문은 쓰지 않아 DB 쓰기 최소화).
export async function touchLastSeen(userId: string): Promise<void> {
  await query(
    `UPDATE users SET last_seen_at = now()
     WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '1 hour')`,
    [userId],
  );
}
