import { query } from '../db';
import { sendToUser } from './send';
import { computeToday } from '../study/plan';

const INACTIVE_DAYS = 3;
const APP_URL = process.env.APP_URL || '';

interface IdRow {
  id: string;
}
interface ReviewRow {
  id: string;
  due: string;
}
interface PlanRow {
  user_id: string;
  cert_slug: string;
  exam_date: string;
  created_at: string;
  due: string;
}

export interface ReminderResult {
  hour: number;
  inactiveSent: number;
  planSent: number;
  reviewSent: number;
}

function ddayLabel(dday: number): string {
  return dday > 0 ? `D-${dday}` : dday === 0 ? 'D-DAY' : `D+${-dday}`;
}

// 특정 KST 시각(0~23)에 보내야 할 알림을 모두 발송한다.
// 우선순위: 복귀 알림 > 합격 플랜(오늘 분량) > 복습 리마인더. 한 사용자에겐 하루 1건만.
export async function runReminders(kstHour: number): Promise<ReminderResult> {
  const sent = new Set<string>();

  // 1) 복귀 알림: 알림 켬 + 해당 시각 + INACTIVE_DAYS일+ 미방문 + 최근 복귀알림 없음 + 구독 존재.
  const inactive = await query<IdRow>(
    `SELECT u.id FROM users u
     WHERE u.notify_inactive = true AND u.reminder_hour = $1
       AND u.last_seen_at < now() - ($2 || ' days')::interval
       AND (u.last_inactive_notif_at IS NULL OR u.last_inactive_notif_at < now() - ($2 || ' days')::interval)
       AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)`,
    [kstHour, String(INACTIVE_DAYS)],
  );
  let inactiveSent = 0;
  for (const { id } of inactive) {
    const n = await sendToUser(id, {
      title: '오랜만이에요 👋',
      body: '며칠 쉬었네요. 오늘 5분만 이어가 볼까요?',
      url: `${APP_URL}/review`,
      tag: 'inactive',
    });
    if (n > 0) inactiveSent += 1;
    sent.add(id);
    await query('UPDATE users SET last_inactive_notif_at = now() WHERE id = $1', [id]);
  }

  // 2) 합격 플랜: 알림 켬 + 해당 시각 + 시험일 안 지남 + 구독 존재. 오늘 분량을 안내.
  const planRows = await query<PlanRow>(
    `SELECT sp.user_id, sp.cert_slug, sp.exam_date, sp.created_at,
            (SELECT COUNT(*) FROM review_items r WHERE r.user_id = sp.user_id AND r.due_at <= now()) AS due
     FROM study_plans sp
     JOIN users u ON u.id = sp.user_id
     WHERE u.notify_review = true AND u.reminder_hour = $1
       AND sp.exam_date >= (now() AT TIME ZONE 'Asia/Seoul')::date
       AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = sp.user_id)
     ORDER BY sp.user_id, sp.exam_date ASC`,
    [kstHour],
  );
  let planSent = 0;
  for (const row of planRows) {
    if (sent.has(row.user_id)) continue; // 복귀 알림으로 이미 보냄, 또는 이 사용자 다른 플랜 이미 처리.
    const portion = await computeToday({ certSlug: row.cert_slug, examDate: row.exam_date.slice(0, 10), createdAt: row.created_at });
    const due = Number(row.due);
    const reviewSuffix = due > 0 ? ` · 복습 ${due}개` : '';
    let body: string;
    if (portion.finished) {
      body = due > 0 ? `예정 분량 완료! 복습 ${due}개로 마무리해요.` : `예정 분량을 모두 봤어요. 오늘은 복습으로 다져요 💪`;
    } else if (portion.items.length > 0) {
      body = `오늘 학습 ${portion.items.length}개${reviewSuffix}`;
    } else if (due > 0) {
      body = `복습 ${due}개가 기다리고 있어요.`;
    } else {
      continue; // 오늘 보낼 내용 없음.
    }
    const n = await sendToUser(row.user_id, {
      title: `${ddayLabel(portion.dday)} · 오늘의 학습`,
      body,
      url: `${APP_URL}/dashboard`,
      tag: 'plan',
    });
    if (n > 0) planSent += 1;
    sent.add(row.user_id);
  }

  // 3) 복습 리마인더: 플랜 없는 사용자 중 마감 복습카드 있는 사람.
  const review = await query<ReviewRow>(
    `SELECT u.id, COUNT(r.id) AS due
     FROM users u
     JOIN review_items r ON r.user_id = u.id AND r.due_at <= now()
     WHERE u.notify_review = true AND u.reminder_hour = $1
       AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = u.id)
     GROUP BY u.id HAVING COUNT(r.id) > 0`,
    [kstHour],
  );
  let reviewSent = 0;
  for (const { id, due } of review) {
    if (sent.has(id)) continue;
    const n = await sendToUser(id, {
      title: '오늘의 복습',
      body: `복습할 카드 ${Number(due)}개가 기다리고 있어요.`,
      url: `${APP_URL}/review`,
      tag: 'review',
    });
    if (n > 0) reviewSent += 1;
    sent.add(id);
  }

  return { hour: kstHour, inactiveSent, planSent, reviewSent };
}
