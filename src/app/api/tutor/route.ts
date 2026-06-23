import { getCurrentUser } from '@/lib/auth/currentUser';
import { AppError, errorResponse } from '@/lib/auth/errors';
import { getEntitlementService } from '@/lib/entitlement/factory';
import { getQuestionById } from '@/lib/questions';
import { consumeTutorQuota, isTutorConfigured, sanitizeHistory, streamTutor } from '@/lib/tutor/tutorService';
import { clientIp, rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs'; // Anthropic SDK는 Node 런타임 필요.
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 스트리밍 응답 여유(플랜에 따라 상한 적용).

// AI 오답 튜터. Pro 전용. 문제+오답을 받아 한국어 설명을 text/plain으로 스트리밍한다.
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new AppError(401, 'unauthorized', '로그인이 필요합니다.');

    // 사용자 단위 rate limit(LLM 호출 비용 보호). IP도 함께 키에 섞는다.
    const rl = rateLimit(`tutor:${user.sub}:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) {
      throw new AppError(429, 'rate_limited', `잠시 후 다시 시도해 주세요. (${rl.retryAfter}초)`);
    }

    const ent = await getEntitlementService().getEntitlement(user.sub);
    if (!ent.isPro) {
      throw new AppError(403, 'pro_required', 'AI 오답 튜터는 Pro 전용 기능입니다.');
    }
    if (!isTutorConfigured()) {
      throw new AppError(503, 'tutor_unavailable', 'AI 튜터가 아직 설정되지 않았습니다.');
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.questionId !== 'string') {
      throw new AppError(400, 'invalid_body', '문제 ID가 필요합니다.');
    }
    const question = getQuestionById(body.questionId);
    if (!question) throw new AppError(404, 'question_not_found', '문제를 찾을 수 없습니다.');

    // 일일 사용 한도(비용 보호). LLM 호출 전에 선차감 — 초과 시 호출 자체를 막는다.
    const quota = await consumeTutorQuota(user.sub);
    if (!quota.allowed) {
      throw new AppError(429, 'daily_limit', `오늘 AI 설명 한도(${quota.limit}회)를 모두 사용했어요. 내일 다시 이용해 주세요.`);
    }

    const selected = typeof body.selected === 'string' ? body.selected : '';
    const history = sanitizeHistory(body.history);

    const sdkStream = streamTutor(question, selected, history);
    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of sdkStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text));
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

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
