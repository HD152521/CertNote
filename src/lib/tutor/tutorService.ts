import Anthropic from '@anthropic-ai/sdk';
import type { IndexedQuestion } from '../questions';
import type { Language } from '@/lib/i18n-client';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { query } from '../db';
import { fakeTutorStream, isFakeTutorEnabled, type FakeTutorMode } from './fakeTutor';

// 유저별 일일(KST) 실호출 상한(LLM 비용 보호). env로 조정 가능, 기본 3회.
export const TUTOR_DAILY_LIMIT = Number(process.env.TUTOR_DAILY_LIMIT) || 3;

// 전체 사용자 합산 일일(KST) 실호출 상한. 계정을 여러 개 만들어 유저별 한도를 우회하는 경우의 비용 천장.
// 기본 500: Haiku 4.5 기준 호출당 약 $0.005 가정 시 하루 최대 약 $2.5. env(TUTOR_GLOBAL_DAILY_LIMIT)로 조정.
export const DEFAULT_TUTOR_GLOBAL_DAILY_LIMIT = 500;
export const TUTOR_GLOBAL_DAILY_LIMIT =
  Number(process.env.TUTOR_GLOBAL_DAILY_LIMIT) || DEFAULT_TUTOR_GLOBAL_DAILY_LIMIT;

// 모델은 env로 교체 가능. 기본 Haiku 4.5(비용·지연 최소). Opus 계열로 바꾸면 effort 를 함께 보낸다(아래 streamTutor).
export const DEFAULT_TUTOR_MODEL = 'claude-haiku-4-5';
export function getTutorModel(): string {
  return process.env.TUTOR_MODEL || DEFAULT_TUTOR_MODEL;
}
const MAX_HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 2000;

let client: Anthropic | null = null;

export function isTutorConfigured(): boolean {
  return isFakeTutorEnabled() || Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY 미설정');
  }
  if (!client) client = new Anthropic();
  return client;
}

export interface TutorTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface QuotaResult {
  allowed: boolean;
  count: number;
  limit: number;
  // 차감이 기록된 KST 날짜(YYYY-MM-DD). 허용된 호출에만 있다. 환불은 반드시 이 날짜로 해야 한다 —
  // 자정을 넘겨 실패한 호출이 now() 기준 "오늘" 행을 깎으면 다음 날 한도가 뚫린다.
  day?: string;
}

interface ChargedRow {
  count: number;
  day: string;
}

function toQuotaResult(row: ChargedRow | undefined, limit: number): QuotaResult {
  return row ? { allowed: true, count: row.count, limit, day: row.day } : { allowed: false, count: limit, limit };
}

// 오늘(KST) 사용 1회를 선차감한다. LLM 호출 전에 차감하므로 비용 상한이 보장된다.
// 한도에 도달한 상태의 호출은 카운트를 올리지 않는다(ON CONFLICT ... WHERE count < limit):
// 거부 시 RETURNING 이 비어 있고, 조건 판정과 증가가 한 문장이라 병렬 호출이 한도를 넘어 통과할 수 없다.
export async function consumeTutorQuota(userId: string, limit: number = TUTOR_DAILY_LIMIT): Promise<QuotaResult> {
  if (limit <= 0) return { allowed: false, count: 0, limit };
  const rows = await query<ChargedRow>(
    `INSERT INTO tutor_usage (user_id, day, count)
     VALUES ($1, (now() AT TIME ZONE 'Asia/Seoul')::date, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET count = tutor_usage.count + 1
       WHERE tutor_usage.count < $2
     RETURNING count, to_char(tutor_usage.day, 'YYYY-MM-DD') AS day`,
    [userId, limit],
  );
  return toQuotaResult(rows[0], limit);
}

// 차감한 1회를 되돌린다. LLM 호출이 한 글자도 내보내기 전에 실패했을 때만 호출한다 —
// 하루 한도가 작아서, 서버 쪽 장애로 사용자의 횟수가 소진되면 안 된다.
// day 는 consumeTutorQuota 가 돌려준 차감 날짜(자정을 넘겨도 차감한 그 행만 되돌린다).
export async function refundTutorQuota(userId: string, day: string): Promise<void> {
  await query(
    `UPDATE tutor_usage SET count = count - 1
     WHERE user_id = $1 AND day = $2::date AND count > 0`,
    [userId, day],
  );
}

// 전체 사용자 합산 일일 호출 1회를 선차감한다. 사용자 쿼터와 같은 원자적 upsert 구조(거부 시 카운트 불변).
export async function consumeGlobalTutorQuota(limit: number = TUTOR_GLOBAL_DAILY_LIMIT): Promise<QuotaResult> {
  if (limit <= 0) return { allowed: false, count: 0, limit };
  const rows = await query<ChargedRow>(
    `INSERT INTO tutor_global_usage (day, count)
     VALUES ((now() AT TIME ZONE 'Asia/Seoul')::date, 1)
     ON CONFLICT (day) DO UPDATE SET count = tutor_global_usage.count + 1
       WHERE tutor_global_usage.count < $1
     RETURNING count, to_char(tutor_global_usage.day, 'YYYY-MM-DD') AS day`,
    [limit],
  );
  return toQuotaResult(rows[0], limit);
}

// day 는 consumeGlobalTutorQuota 가 돌려준 차감 날짜.
export async function refundGlobalTutorQuota(day: string): Promise<void> {
  await query(
    `UPDATE tutor_global_usage SET count = count - 1
     WHERE day = $1::date AND count > 0`,
    [day],
  );
}

// 첫 설명 캐시 조회. (문제, 고른 오답) 기준으로 모든 사용자에게 동일하므로 1회만 생성한다.
export async function getCachedExplanation(questionId: string, selected: string): Promise<string | null> {
  const rows = await query<{ content: string }>(
    'SELECT content FROM tutor_explanations WHERE question_id = $1 AND selected = $2',
    [questionId, selected],
  );
  return rows[0]?.content ?? null;
}

// 첫 설명을 캐시에 저장. 동시 생성 충돌은 무시(먼저 저장된 것을 유지).
export async function saveExplanation(questionId: string, selected: string, content: string): Promise<void> {
  await query(
    `INSERT INTO tutor_explanations (question_id, selected, content)
     VALUES ($1, $2, $3)
     ON CONFLICT (question_id, selected) DO NOTHING`,
    [questionId, selected, content],
  );
}

// 신뢰할 수 없는 입력(클라이언트 후속 대화)을 정리: 역할 검증·길이·개수 제한.
export function sanitizeHistory(raw: unknown): TutorTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: TutorTurn[] = [];
  for (const item of raw) {
    const role = item?.role;
    const text = item?.text;
    if ((role === 'user' || role === 'assistant') && typeof text === 'string' && text.trim()) {
      turns.push({ role, text: text.slice(0, MAX_TURN_CHARS) });
    }
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}

// 문제 + 사용자가 고른 오답 + (선택)후속 대화로 설명을 스트리밍한다.
// 반환값은 SDK의 MessageStream(라우트에서 text delta를 그대로 흘려보낸다).
export function streamTutor(
  q: IndexedQuestion,
  selected: string,
  history: TutorTurn[],
  language: Language = 'ko',
  fakeMode?: FakeTutorMode,
) {
  // E2E 전용 가짜 스트림(fakeTutor.ts). Vercel 에서는 isFakeTutorEnabled()가 항상 false.
  if (isFakeTutorEnabled()) return fakeTutorStream(fakeMode ?? 'ok');
  // messages[0]은 항상 합성된 문제 프롬프트(user). 이후 후속 대화가 alternate로 이어진다.
  const messages = [
    { role: 'user' as const, content: buildUserPrompt(q, selected, language) },
    ...history.map((t) => ({ role: t.role, content: t.text })),
  ];
  // effort(output_config)는 Opus 4.x 계열만 지원. Haiku 등은 보내면 400 에러가 나므로
  // Opus일 때만 첨부한다. (비용 절감용 Haiku 모델에서도 동작하도록)
  const model = getTutorModel();
  const supportsEffort = model.startsWith('claude-opus');
  return getClient().messages.stream({
    model,
    max_tokens: 2048,
    system: buildSystemPrompt(language),
    ...(supportsEffort ? { output_config: { effort: 'medium' as const } } : {}),
    messages,
  });
}
