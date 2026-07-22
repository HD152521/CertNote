import { DEFAULT_CATEGORY } from '../category';
import { listCerts, type CertMeta } from '../content';
import { getEntitlementService } from '../entitlement/factory';
import type { Entitlement } from '../entitlement/types';
import { getLearnerProfile, type LearnerProfile } from '../profile/profileService';
import { getAttemptService } from '../quiz/attemptService';
import type { AttemptRecord } from '../quiz/attemptRepository';
import { getReviewService } from '../review/factory';
import type { ReviewCounts } from '../review/types';
import { listPlans, type StudyPlan } from '../study/plan';

// 대시보드/개인화 함수들이 공통으로 쓰는 사용자 원시 데이터.
// 대시보드 렌더 시 이걸 '한 번' 로드해 주입하면 attempts/certs/plans 중복 조회를 없앤다.
export interface StudyContext {
  attempts: AttemptRecord[];
  certs: CertMeta[];
  entitlement: Entitlement;
  plans: StudyPlan[];
  profile: LearnerProfile;
  review: ReviewCounts;
}

const ATTEMPT_LIMIT = 5000;

// 공유 원시 데이터를 병렬로 1회 로드.
export async function loadStudyContext(userId: string): Promise<StudyContext> {
  const [attempts, certs, entitlement, plans, profile, review] = await Promise.all([
    getAttemptService().list(userId, ATTEMPT_LIMIT),
    listCerts(DEFAULT_CATEGORY),
    getEntitlementService().getEntitlement(userId),
    listPlans(userId),
    getLearnerProfile(userId),
    getReviewService().stats(userId),
  ]);
  return { attempts, certs, entitlement, plans, profile, review };
}
