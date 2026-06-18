import { query } from '../db';
import { getAllDays } from '../content';
import { kstToday } from './activity';
import type { DayRef } from '../content';

export interface StudyPlan {
  certSlug: string;
  examDate: string; // 'YYYY-MM-DD'
  createdAt: string;
}

export interface TodayPortion {
  certSlug: string;
  examDate: string;
  dday: number; // 시험까지 남은 일수(0=오늘, 음수=지남)
  items: DayRef[]; // 오늘 학습 권장 분량
  totalDays: number;
  scheduledIndex: number; // 오늘까지 누적 학습해야 할 day 수(진행 기대치)
  finished: boolean; // 일정상 모든 분량을 다 본 시점인지
}

interface PlanRow {
  cert_slug: string;
  exam_date: string;
  created_at: string;
}

function ymd(value: string): string {
  return value.slice(0, 10);
}

// 두 'YYYY-MM-DD' 사이 일수(b - a).
function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

export async function getPlan(userId: string, certSlug: string): Promise<StudyPlan | null> {
  const rows = await query<PlanRow>(
    'SELECT cert_slug, exam_date, created_at FROM study_plans WHERE user_id = $1 AND cert_slug = $2',
    [userId, certSlug],
  );
  return rows[0] ? { certSlug: rows[0].cert_slug, examDate: ymd(rows[0].exam_date), createdAt: rows[0].created_at } : null;
}

// 사용자의 모든 플랜(시험일 가까운 순).
export async function listPlans(userId: string): Promise<StudyPlan[]> {
  const rows = await query<PlanRow>(
    'SELECT cert_slug, exam_date, created_at FROM study_plans WHERE user_id = $1 ORDER BY exam_date ASC',
    [userId],
  );
  return rows.map((r) => ({ certSlug: r.cert_slug, examDate: ymd(r.exam_date), createdAt: r.created_at }));
}

// 시험일 설정(upsert). examDate는 'YYYY-MM-DD'.
export async function setPlan(userId: string, certSlug: string, examDate: string): Promise<void> {
  await query(
    `INSERT INTO study_plans (user_id, cert_slug, exam_date)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, cert_slug) DO UPDATE SET exam_date = $3`,
    [userId, certSlug, examDate],
  );
}

export async function clearPlan(userId: string, certSlug: string): Promise<void> {
  await query('DELETE FROM study_plans WHERE user_id = $1 AND cert_slug = $2', [userId, certSlug]);
}

// 콘텐츠 day들을 생성일→시험일에 균등 분배해 '오늘 분량'을 계산(읽음 진행도와 무관, 날짜 기반).
export async function computeToday(plan: StudyPlan): Promise<TodayPortion> {
  const days = await getAllDays('aws-certs', plan.certSlug);
  const totalDays = days.length;
  const today = kstToday();
  const start = ymd(plan.createdAt);
  const dday = daysBetween(today, plan.examDate);

  // 학습 가능 일수(시작일~시험일 전날). 최소 1.
  const span = Math.max(1, daysBetween(start, plan.examDate));
  const perDay = Math.max(1, Math.ceil(totalDays / span));
  const elapsed = Math.max(0, daysBetween(start, today));

  const scheduledIndex = Math.min(totalDays, (elapsed + 1) * perDay); // 오늘까지 봤어야 할 누적 분량
  const startIdx = Math.min(totalDays, elapsed * perDay);
  const items = days.slice(startIdx, Math.min(totalDays, startIdx + perDay));
  const finished = startIdx >= totalDays;

  return { certSlug: plan.certSlug, examDate: plan.examDate, dday, items, totalDays, scheduledIndex, finished };
}
