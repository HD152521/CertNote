import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { clientIp, rateLimit } from '@/lib/rateLimit';
import type { Language } from '@/lib/i18n';
import { resolveFakeMode } from '@/lib/tutor/fakeTutor';
import { getTutorError } from '@/lib/tutor/errors';
import { parseTutorInput, reserveTutorCall, type TutorInput } from '@/lib/tutor/tutorRequest';
import {
  getCachedExplanation,
  isTutorConfigured,
  saveExplanation,
  streamTutor,
} from '@/lib/tutor/tutorService';
import { pipeTutorText, primeTutorStream } from '@/lib/tutor/tutorStream';
import { tutorCacheKey } from '@/lib/tutor/cacheKey';

export const runtime = 'nodejs'; // Anthropic SDK는 Node 런타임 필요.
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 스트리밍 응답 여유(플랜에 따라 상한 적용).

const TEXT_HEADERS = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };

// 구조화된 로깅: 타이스탬프, 컨텍스트, 사용자 ID, 에러 메시지
const logError = (context: string, userId: string, error: unknown) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      context,
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
  );
};

// LLM 호출 + 첫 텍스트 대기. 첫 텍스트 전에 실패(예외 또는 빈 응답)하면 차감분을 환불하고 502 JSON 오류를 던진다.
// 첫 텍스트가 나온 뒤에는 스트리밍 응답을 돌려준다(이후 실패는 환불하지 않는다 — 사용자가 이미 일부를 받았다).
async function streamExplanation(
  req: Request,
  userId: string,
  input: TutorInput,
  language: Language,
  refund: () => Promise<void>,
): Promise<Response> {
  const isFirstTurn = input.history.length === 0;
  let primed;
  try {
    const source = streamTutor(input.question, input.selected, input.history, language, resolveFakeMode(req.headers));
    primed = await primeTutorStream(source);
    if (!primed) throw new Error('LLM 응답에 텍스트가 없습니다.');
  } catch (err) {
    logError('stream_failed_before_text', userId, err);
    await refund().catch((e) => logError('quota_refund_failed', userId, e));
    throw new AppError(502, 'tutor_failed', getTutorError(language, 'streamFailed'));
  }

  const body = pipeTutorText(primed, {
    // 첫 설명이면 캐시에 저장 → 다음 사용자부터 무료·즉시. 저장 실패는 응답에 영향 없음.
    onComplete: async (full) => {
      if (!isFirstTurn || !full.trim()) return;
      try {
        await saveExplanation(tutorCacheKey(input.questionId, input.question), input.selected, full);
      } catch (e) {
        logError('cache_save_failed', userId, e);
      }
    },
    // 스트림 도중 오류는 로그만 — 헤더는 이미 전송돼 상태코드를 못 바꾼다.
    onError: (err) => logError('stream_error', userId, err),
  });
  return new Response(body, { headers: TEXT_HEADERS });
}

// AI 오답 튜터. 로그인 사용자 누구나(이메일 인증 불필요, 2026-10-27 결정), 계정당 하루 TUTOR_DAILY_LIMIT회(전체 합산은 TUTOR_GLOBAL_DAILY_LIMIT회).
// 문제+오답을 받아 설명을 text/plain으로 스트리밍한다.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const language: Language = body?.language === 'en' ? 'en' : 'ko';

    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', getTutorError(language, 'unauthorized'));

    // 사용자 단위 rate limit(LLM 호출 비용 보호). IP도 함께 키에 섞는다.
    const rl = rateLimit(`tutor:${user.sub}:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) {
      throw new AppError(429, 'rate_limited', getTutorError(language, 'rateLimited'));
    }

    if (!isTutorConfigured()) {
      throw new AppError(503, 'tutor_unavailable', getTutorError(language, 'tutorUnavailable'));
    }

    const input = parseTutorInput(body, language);

    // 캐시 히트: 첫 설명(후속 대화 없음)이 (문제, 고른 오답)에 대해 이미 있으면 LLM·쿼터 없이 즉시 반환.
    // 후속 질문은 사용자마다 달라 캐시 대상이 아니다.
    if (input.history.length === 0) {
      // 모의고사 문제는 내용 지문을 키에 붙여, 보기 문구·순서가 바뀐 뒤 예전 설명이 나오지 않게 한다(cacheKey.ts).
      const cached = await getCachedExplanation(tutorCacheKey(input.questionId, input.question), input.selected);
      if (cached) return new Response(cached, { headers: TEXT_HEADERS });
    }

    // 여기부터 실제 LLM 호출 — 전역·사용자 일일 한도는 이 시점에만 차감(캐시 히트는 무료).
    const reservation = await reserveTutorCall(user.sub, language);
    return await streamExplanation(req, user.sub, input, language, reservation.refund);
  } catch (err) {
    return errorResponse(err);
  }
}
