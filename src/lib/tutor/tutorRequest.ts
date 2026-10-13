import { AppError } from '@/lib/auth/errors';
import { getVerificationStatus } from '@/lib/auth/emailVerification';
import { getQuestionById, type IndexedQuestion } from '@/lib/questions';
import type { Language } from '@/lib/i18n';
import { getTutorError } from './errors';
import { normalizeSelected } from './selectedAnswer';
import {
  consumeGlobalTutorQuota,
  consumeTutorQuota,
  refundGlobalTutorQuota,
  refundTutorQuota,
  sanitizeHistory,
  type TutorTurn,
} from './tutorService';

// /api/tutor 라우트가 쓰는 요청 단계별 검사. 각 함수는 거부 사유를 AppError 로 던진다(상태코드 포함).

// 이메일 인증된 계정만 통과. 소셜 가입자는 가입 시점에 email_verified=true 로 저장되므로 별도 분기가 없다
// (userRepository.createOauthUser / linkOauth). 사용자 행을 못 찾으면 인증된 것으로 가정하지 않는다.
export async function requireVerifiedEmail(userId: string, language: Language): Promise<void> {
  const status = await getVerificationStatus(userId);
  if (!status?.emailVerified) {
    throw new AppError(403, 'email_unverified', getTutorError(language, 'emailUnverified'));
  }
}

export interface TutorInput {
  questionId: string;
  question: IndexedQuestion;
  selected: string; // 정규화된 보기 글자("B,D")
  history: TutorTurn[];
}

export function parseTutorInput(body: unknown, language: Language): TutorInput {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.questionId !== 'string') {
    throw new AppError(400, 'invalid_body', getTutorError(language, 'questionIdRequired'));
  }
  const history = sanitizeHistory(b.history);
  // 후속 대화는 사용자 질문으로 끝나야 한다. assistant 로 끝나는 이력은 빈 응답을 유도해
  // "텍스트 없음 → 환불" 규칙으로 무료·반복 가능한 실호출이 되므로 LLM·쿼터 이전에 거부한다.
  if (history.length > 0 && history[history.length - 1].role !== 'user') {
    throw new AppError(400, 'invalid_history', getTutorError(language, 'invalidHistory'));
  }
  const selected = normalizeSelected(b.selected);
  if (selected === null) {
    throw new AppError(400, 'invalid_selected', getTutorError(language, 'invalidSelected'));
  }
  const question = getQuestionById(b.questionId);
  if (!question) throw new AppError(404, 'question_not_found', getTutorError(language, 'invalidQuestion'));
  return { questionId: b.questionId, question, selected, history };
}

export interface TutorReservation {
  // 호출이 한 글자도 내보내기 전에 실패했을 때 차감분(전역+사용자)을 되돌린다.
  refund: () => Promise<void>;
}

// 실제 LLM 호출 직전의 쿼터 확보. 순서: 전역 → 사용자.
// - 전역 상한 초과면 사용자 쿼터는 건드리지 않는다(503).
// - 사용자 한도 초과면 방금 잡은 전역 1회를 돌려준다(거부된 사용자가 전역 용량을 갉아먹지 않게). 429.
// 각 consume 은 거부 시 카운트를 올리지 않으므로 사용자 쪽은 되돌릴 것이 없다.
export async function reserveTutorCall(userId: string, language: Language): Promise<TutorReservation> {
  const global = await consumeGlobalTutorQuota();
  if (!global.allowed) {
    throw new AppError(503, 'global_limit', getTutorError(language, 'globalLimitExceeded'));
  }

  // 환불은 항상 "차감한 날짜"로 한다(자정 경계에서 다음 날 행을 깎지 않도록).
  const globalDay = global.day!;
  let quota;
  try {
    quota = await consumeTutorQuota(userId);
  } catch (err) {
    await refundGlobalTutorQuota(globalDay).catch(() => {});
    throw err;
  }
  if (!quota.allowed) {
    await refundGlobalTutorQuota(globalDay).catch(() => {});
    const msg = language === 'en'
      ? `Daily limit (${quota.limit} explanations) reached. Try again tomorrow.`
      : `오늘 AI 설명 한도(${quota.limit}회)를 모두 사용했어요. 내일 다시 이용해 주세요.`;
    throw new AppError(429, 'daily_limit', msg);
  }

  const userDay = quota.day!;
  return {
    refund: async () => {
      const results = await Promise.allSettled([refundTutorQuota(userId, userDay), refundGlobalTutorQuota(globalDay)]);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) throw failed.reason;
    },
  };
}
