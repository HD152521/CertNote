import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { getQuestionById } from '@/lib/questions';
import {
  consumeTutorQuota,
  getCachedExplanation,
  isTutorConfigured,
  sanitizeHistory,
  saveExplanation,
  streamTutor,
} from '@/lib/tutor/tutorService';
import { getTutorError } from '@/lib/tutor/errors';
import type { Language } from '@/lib/i18n';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs'; // Anthropic SDK는 Node 런타임 필요.
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 스트리밍 응답 여유(플랜에 따라 상한 적용).

// AI 오답 튜터. Pro 전용. 문제+오답을 받아 설명을 text/plain으로 스트리밍한다.
export async function POST(req: Request) {
  try {
    // language 파라미터 추출 (기본값: ko)
    const body = await req.json().catch(() => null);
    const language: Language = body?.language === 'en' ? 'en' : 'ko';

    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', getTutorError(language, 'proRequired'));

    // 사용자 단위 rate limit(LLM 호출 비용 보호). IP도 함께 키에 섞는다.
    const rl = rateLimit(`tutor:${user.sub}:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) {
      const msg = language === 'en'
        ? `Please wait and try again. (${rl.retryAfter}s)`
        : `잠시 후 다시 시도해 주세요. (${rl.retryAfter}초)`;
      throw new AppError(429, 'rate_limited', msg);
    }

    const ent = await getEntitlementService().getEntitlement(user.sub);
    if (!ent.isPro) {
      throw new AppError(403, 'pro_required', getTutorError(language, 'proRequired'));
    }
    if (!isTutorConfigured()) {
      const msg = language === 'en' ? 'AI tutor is not available yet.' : 'AI 튜터가 아직 설정되지 않았습니다.';
      throw new AppError(503, 'tutor_unavailable', msg);
    }

    if (!body || typeof body.questionId !== 'string') {
      const msg = language === 'en' ? 'Question ID is required.' : '문제 ID가 필요합니다.';
      throw new AppError(400, 'invalid_body', msg);
    }
    const question = getQuestionById(body.questionId);
    if (!question) throw new AppError(404, 'question_not_found', getTutorError(language, 'invalidQuestion'));

    const selected = typeof body.selected === 'string' ? body.selected : '';
    const history = sanitizeHistory(body.history);
    // 첫 설명(후속 대화 없음)만 캐시 대상 — 후속 질문은 사용자마다 달라 라이브 호출.
    const isFirstTurn = history.length === 0;
    const textHeaders = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };

    // 캐시 히트: (문제, 고른 오답)에 대한 설명이 이미 있으면 LLM·쿼터 없이 즉시 반환.
    if (isFirstTurn) {
      const cached = await getCachedExplanation(body.questionId, selected);
      if (cached) return new Response(cached, { headers: textHeaders });
    }

    // 여기부터 실제 LLM 호출 — 일일 한도는 이 시점에만 차감(캐시 히트는 무료).
    const quota = await consumeTutorQuota(user.sub);
    if (!quota.allowed) {
      const msg = language === 'en'
        ? `Daily limit (${quota.limit} explanations) reached. Try again tomorrow.`
        : `오늘 AI 설명 한도(${quota.limit}회)를 모두 사용했어요. 내일 다시 이용해 주세요.`;
      throw new AppError(429, 'daily_limit', msg);
    }

    const sdkStream = streamTutor(question, selected, history, language);
    const encoder = new TextEncoder();
    const questionId = body.questionId;
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        let full = '';
        try {
          for await (const event of sdkStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              full += event.delta.text;
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          // 첫 설명이면 캐시에 저장 → 다음 사용자부터 무료·즉시. 저장 실패는 응답에 영향 없음.
          if (isFirstTurn && full.trim()) {
            try {
              await saveExplanation(questionId, selected, full);
            } catch (e) {
              console.error('[tutor] 캐시 저장 실패:', e);
            }
          }
          controller.close();
        } catch (err) {
          // 스트림 도중 오류는 로그만 — 헤더는 이미 전송돼 상태코드를 못 바꾼다.
          console.error('[tutor] 스트림 오류:', err);
          controller.error(err);
        }
      },
    });

    return new Response(readable, { headers: textHeaders });
  } catch (err) {
    return errorResponse(err);
  }
}
