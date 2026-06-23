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
  return getClient().messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system: buildSystemPrompt(),
    output_config: { effort: 'medium' },
    messages,
  });
}
