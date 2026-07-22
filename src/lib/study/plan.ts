import { DEFAULT_CATEGORY } from '../category';
import { query } from '../db';
import { getAllDays } from '../content';
import { kstToday } from './activity';
import type { DayRef } from '../content';

// computeToday가 실제로 쓰는 최소 스케줄 정보. StudyPlan이 목표 필드로 커져도
// 리터럴 호출(크론 등)이 깨지지 않도록 좁은 구조 타입으로 분리한다.
export interface PlanSchedule {
  certSlug: string;
  examDate: string; // 'YYYY-MM-DD'
  createdAt: string;
}

export interface StudyPlan extends PlanSchedule {
  targetAccuracy: number; // 목표 정확도(%) — 기본 70. 합격확률 임계값으로 사용.
  dailyMinutesGoal: number | null; // 일일 학습시간 목표(분), 미설정 시 null.
}

export interface PlanGoals {
  targetAccuracy: number;
  dailyMinutesGoal: number | null;
}

const DEFAULT_TARGET_ACCURACY = 70;
const MAX_DAILY_MINUTES = 600;

// 입력값(임의 타입)을 안전한 목표로 정규화(순수). 검증·클램프.
export function normalizeGoals(input: { targetAccuracy?: unknown; dailyMinutesGoal?: unknown }): PlanGoals {
  const acc = Number(input.targetAccuracy);
  const targetAccuracy = Number.isFinite(acc) ? Math.min(100, Math.max(0, Math.round(acc))) : DEFAULT_TARGET_ACCURACY;

  let dailyMinutesGoal: number | null = null;
  const dm = input.dailyMinutesGoal;
  if (dm !== null && dm !== undefined && dm !== '') {
    const n = Number(dm);
    if (Number.isFinite(n) && n > 0) dailyMinutesGoal = Math.min(MAX_DAILY_MINUTES, Math.round(n));
  }
  return { targetAccuracy, dailyMinutesGoal };
}

export interface CatchUp {
  isBehind: boolean;
  behindBy: number; // 기대 진도보다 덜 한 day 수
  perDay: number; // 오늘 권장 분량(뒤처지면 상향)
  basePerDay: number; // 원래 일일 분량
}

export interface TodayPortion {
  certSlug: string;
  examDate: string;
  dday: number; // 시험까지 남은 일수(0=오늘, 음수=지남)
  items: DayRef[]; // 오늘 학습 권장 분량
  totalDays: number;
  scheduledIndex: number; // 오늘까지 누적 학습해야 할 day 수(진행 기대치)
  finished: boolean; // 일정상 모든 분량을 다 본 시점인지
  catchUp?: CatchUp; // 실제 진도(completedDays)를 넘겼을 때만 계산됨
}

const BEHIND_THRESHOLD = 3; // 이만큼 뒤처지면 재계산.
const MAX_INTENSITY = 3; // 오늘 분량 상향 상한(기본 분량의 배수) — 과부하 방지.

// 실제 진도 vs 기대 진도로 뒤처짐을 판정하고, 뒤처지면 남은 분량을 남은 기간에 재분배(순수).
export function computeCatchUp(input: {
  totalDays: number;
  completedDays: number;
  scheduledIndex: number;
  dday: number;
  basePerDay: number;
}): CatchUp {
  const { totalDays, completedDays, scheduledIndex, dday, basePerDay } = input;
  const behindBy = Math.max(0, scheduledIndex - completedDays);
  if (behindBy < BEHIND_THRESHOLD) {
    return { isBehind: false, behindBy, perDay: basePerDay, basePerDay };
  }
  const remaining = Math.max(0, totalDays - completedDays);
  const remainingDays = Math.max(1, dday); // 시험 당일/지남은 1일로.
  const catchUpPace = Math.ceil(remaining / remainingDays);
  const perDay = Math.min(basePerDay * MAX_INTENSITY, Math.max(basePerDay, catchUpPace));
  return { isBehind: true, behindBy, perDay, basePerDay };
}

interface PlanRow {
  cert_slug: string;
  exam_date: string;
  created_at: string;
  target_accuracy: number;
  daily_minutes_goal: number | null;
}

// 두 'YYYY-MM-DD' 사이 일수(b - a).
function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

// 사용자의 모든 플랜(시험일 가까운 순).
// 날짜는 SQL에서 'YYYY-MM-DD' 문자열로 변환해 받는다. node-pg는 DATE/timestamptz를
// JS Date로 파싱하는데, 그러면 (1) 문자열 메서드가 깨지고 (2) 타임존 변환으로 하루 밀린다.
// exam_date는 그대로, created_at(시작일)은 KST 날짜로 변환.
export async function listPlans(userId: string): Promise<StudyPlan[]> {
  const rows = await query<PlanRow>(
    `SELECT cert_slug,
            to_char(exam_date, 'YYYY-MM-DD') AS exam_date,
            to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS created_at,
            target_accuracy, daily_minutes_goal
     FROM study_plans WHERE user_id = $1 ORDER BY exam_date ASC`,
    [userId],
  );
  return rows.map((r) => ({
    certSlug: r.cert_slug,
    examDate: r.exam_date,
    createdAt: r.created_at,
    targetAccuracy: r.target_accuracy ?? DEFAULT_TARGET_ACCURACY,
    dailyMinutesGoal: r.daily_minutes_goal ?? null,
  }));
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

// 학습 목표(정확도·일일시간) 갱신. 해당 플랜이 없으면 no-op.
export async function setPlanGoals(userId: string, certSlug: string, goals: PlanGoals): Promise<void> {
  await query(
    'UPDATE study_plans SET target_accuracy = $3, daily_minutes_goal = $4 WHERE user_id = $1 AND cert_slug = $2',
    [userId, certSlug, goals.targetAccuracy, goals.dailyMinutesGoal],
  );
}

// 콘텐츠 day들을 생성일→시험일에 균등 분배해 '오늘 분량'을 계산(읽음 진행도와 무관, 날짜 기반).
export async function computeToday(plan: PlanSchedule, completedDays?: number): Promise<TodayPortion> {
  const days = await getAllDays(DEFAULT_CATEGORY, plan.certSlug);
  const totalDays = days.length;
  const today = kstToday();
  const start = plan.createdAt; // listPlans/크론에서 이미 'YYYY-MM-DD'(KST)로 받음
  const dday = daysBetween(today, plan.examDate);

  // 학습 가능 일수(시작일~시험일 전날). 최소 1.
  const span = Math.max(1, daysBetween(start, plan.examDate));
  const basePerDay = Math.max(1, Math.ceil(totalDays / span));
  const elapsed = Math.max(0, daysBetween(start, today));
  const scheduledIndex = Math.min(totalDays, (elapsed + 1) * basePerDay); // 오늘까지 봤어야 할 누적 분량

  // completedDays 미제공(크론 등) → 기존 날짜 기반 창.
  if (completedDays === undefined) {
    const startIdx = Math.min(totalDays, elapsed * basePerDay);
    const items = days.slice(startIdx, Math.min(totalDays, startIdx + basePerDay));
    return {
      certSlug: plan.certSlug,
      examDate: plan.examDate,
      dday,
      items,
      totalDays,
      scheduledIndex,
      finished: startIdx >= totalDays,
    };
  }

  // 진도 기반: 실제 완료 지점에서 이어보고, 뒤처지면 분량을 재계산해 상향.
  const catchUp = computeCatchUp({ totalDays, completedDays, scheduledIndex, dday, basePerDay });
  const startIdx = Math.min(totalDays, Math.max(0, completedDays));
  const items = days.slice(startIdx, Math.min(totalDays, startIdx + catchUp.perDay));
  return {
    certSlug: plan.certSlug,
    examDate: plan.examDate,
    dday,
    items,
    totalDays,
    scheduledIndex,
    finished: startIdx >= totalDays,
    catchUp,
  };
}
