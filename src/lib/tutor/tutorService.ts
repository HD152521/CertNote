import Anthropic from '@anthropic-ai/sdk';
import type { IndexedQuestion } from '../questions';
import { buildSystemPrompt, buildUserPrompt } from './prompt';

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
