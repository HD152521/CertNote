import Anthropic from '@anthropic-ai/sdk';
import type { IndexedQuestion } from '../questions';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { query } from '../db';

// 유저별 일일 호출 상한(LLM 비용 보호). env로 조정 가능, 기본 10회.
export const TUTOR_DAILY_LIMIT = Number(process.env.TUTOR_DAILY_LIMIT) || 10;

// 모델은 env로 교체 가능. 기본 Opus 4.8(최고 품질). thinking은 끄고 effort로 깊이를 조절해
// 지연·비용을 억제한다(Vercel 함수 타임아웃 여유 확보).
const MODEL = process.env.TUTOR_MODEL || 'claude-opus-4-8';
const MAX_HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 2000;

let client: Anthropic | null = null;

export function isTutorConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
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

// 오늘(KST) 사용 1회를 선차감하고 현재 카운트를 반환(원자적 upsert).
// LLM 호출 전에 차감하므로 비용 상한이 보장된다(초과 시 호출 자체를 막음).
export async function consumeTutorQuota(userId: string): Promise<{ allowed: boolean; count: number; limit: number }> {
  const rows = await query<{ count: number }>(
    `INSERT INTO tutor_usage (user_id, day, count)
     VALUES ($1, (now() AT TIME ZONE 'Asia/Seoul')::date, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET count = tutor_usage.count + 1
     RETURNING count`,
    [userId],
  );
  const count = rows[0]?.count ?? 1;
  return { allowed: count <= TUTOR_DAILY_LIMIT, count, limit: TUTOR_DAILY_LIMIT };
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

// 문제 + 사용자가 고른 오답 + (선택)후속 대화로 한국어 설명을 스트리밍한다.
// 반환값은 SDK의 MessageStream(라우트에서 text delta를 그대로 흘려보낸다).
export function streamTutor(q: IndexedQuestion, selected: string, history: TutorTurn[]) {
  // messages[0]은 항상 합성된 문제 프롬프트(user). 이후 후속 대화가 alternate로 이어진다.
  const messages = [
    { role: 'user' as const, content: buildUserPrompt(q, selected) },
    ...history.map((t) => ({ role: t.role, content: t.text })),
  ];
  // effort(output_config)는 Opus 4.x 계열만 지원. Haiku 등은 보내면 400 에러가 나므로
  // Opus일 때만 첨부한다. (비용 절감용 Haiku 모델에서도 동작하도록)
  const supportsEffort = MODEL.startsWith('claude-opus');
  return getClient().messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system: buildSystemPrompt(),
    ...(supportsEffort ? { output_config: { effort: 'medium' as const } } : {}),
    messages,
  });
}
