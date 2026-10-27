import { AppError } from '@/lib/auth/errors';
import { OTHER_CERT_KEY, isCertCandidateKey } from './certCandidates';

// 문제 오류 신고 사유. 화면 라벨은 컴포넌트가 갖고, 여기는 저장값만 고정한다.
export const REPORT_REASONS = ['answer', 'explanation', 'outdated', 'typo', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_MESSAGE_MAX = 500;
export const OTHER_CERT_NAME_MIN = 2;
export const OTHER_CERT_NAME_MAX = 50;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_MAX = 254;
// questionId()·examQuestionId 형식(slug-w1-d2-q3, slug-exam-12 등)을 넘는 이상한 입력을 DB 조회 전에 거른다.
const QUESTION_ID_RE = /^[a-z0-9-]{3,100}$/;

export interface QuestionReportInput {
  questionId: string;
  reason: ReportReason;
  message: string | null;
}

export interface CertRequestInput {
  certKey: string;
  otherName: string | null;
  email: string | null;
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export function parseQuestionReport(body: unknown): QuestionReportInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const questionId = text(b.questionId);
  if (!QUESTION_ID_RE.test(questionId)) throw new AppError(400, 'invalid_question', '문제를 찾을 수 없습니다.');
  const reason = text(b.reason);
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) {
    throw new AppError(400, 'invalid_reason', '신고 사유를 골라 주세요.');
  }
  const message = text(b.message).slice(0, REPORT_MESSAGE_MAX);
  // '기타'는 내용이 없으면 무엇을 고칠지 알 수 없다.
  if (reason === 'other' && message.length === 0) {
    throw new AppError(400, 'invalid_message', '어떤 부분이 틀렸는지 적어 주세요.');
  }
  return { questionId, reason: reason as ReportReason, message: message || null };
}

export function parseCertRequest(body: unknown): CertRequestInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const certKey = text(b.certKey);
  if (!isCertCandidateKey(certKey)) throw new AppError(400, 'invalid_cert', '자격증을 골라 주세요.');

  let otherName: string | null = null;
  if (certKey === OTHER_CERT_KEY) {
    const name = text(b.otherName);
    if (name.length < OTHER_CERT_NAME_MIN || name.length > OTHER_CERT_NAME_MAX) {
      throw new AppError(400, 'invalid_cert_name', `자격증 이름을 ${OTHER_CERT_NAME_MIN}~${OTHER_CERT_NAME_MAX}자로 적어 주세요.`);
    }
    otherName = name;
  }

  const email = text(b.email).toLowerCase();
  if (email && (email.length > EMAIL_MAX || !EMAIL_RE.test(email))) {
    throw new AppError(400, 'invalid_email', '올바른 이메일을 입력해 주세요.');
  }
  return { certKey, otherName, email: email || null };
}
