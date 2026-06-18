import { query } from '../db';
import { sendToUser } from './send';

const INACTIVE_DAYS = 3;
const APP_URL = process.env.APP_URL || '';

interface ReviewRow {
  id: string;
  due: string;
}
interface IdRow {
  id: string;
}

export interface ReminderResult {
  hour: number;
  inactiveSent: number;
  reviewSent: number;
}

// 특정 KST 시각(0~23)에 보내야 할 알림을 모두 발송한다.
// 한 사용자가 '미방문'과 '복습' 모두 해당되면 복귀 알림을 우선(재방문 유도가 더 중요).
export async function runReminders(kstHour: number): Promise<ReminderResult> {
  // 1) 복귀 알림 대상: 알림 켬 + 해당 시각 + INACTIVE_DAYS일 이상 미방문 + 최근 복귀알림 없음 + 구독 존재.
  const inactive = await query<IdRow>(
    `SELECT u.id FROM users u
     WHERE u.notify_inactive = true AND u.reminder_hour = $1
       AND u.last_seen_at < now() - ($2 || ' days')::interval
       AND (u.last_inactive_notif_at IS NULL OR u.last_inactive_notif_at < now() - ($2 || ' days')::interval)
       AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)`,
    [kstHour, String(INACTIVE_DAYS)],
  );
  const inactiveIds = new Set(inactive.map((r) => r.id));

  let inactiveSent = 0;
  for (const { id } of inactive) {
    const sent = await sendToUser(id, {
      title: '오랜만이에요 👋',
      body: '며칠 쉬었네요. 오늘 5분만 이어가 볼까요?',
      url: `${APP_URL}/review`,
      tag: 'inactive',
    });
    if (sent > 0) inactiveSent += 1;
    // 발송 시도 여부와 무관하게 과발송 방지 타임스탬프 갱신.
    await query('UPDATE users SET last_inactive_notif_at = now() WHERE id = $1', [id]);
  }

  // 2) 복습 리마인더 대상: 알림 켬 + 해당 시각 + 마감된 복습카드 존재 + 구독 존재. (복귀 대상은 제외)
  const review = await query<ReviewRow>(
    `SELECT u.id, COUNT(r.id) AS due
     FROM users u
     JOIN review_items r ON r.user_id = u.id AND r.due_at <= now()
     WHERE u.notify_review = true AND u.reminder_hour = $1
       AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)
     GROUP BY u.id
     HAVING COUNT(r.id) > 0`,
    [kstHour],
  );

  let reviewSent = 0;
  for (const { id, due } of review) {
    if (inactiveIds.has(id)) continue; // 복귀 알림으로 이미 보냄.
    const n = Number(due);
    const sent = await sendToUser(id, {
      title: '오늘의 복습',
      body: `복습할 카드 ${n}개가 기다리고 있어요.`,
      url: `${APP_URL}/review`,
      tag: 'review',
    });
    if (sent > 0) reviewSent += 1;
  }

  return { hour: kstHour, inactiveSent, reviewSent };
}
