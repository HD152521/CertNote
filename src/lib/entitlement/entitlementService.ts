import { AppError } from '../auth/errors';
import { getQuestionById } from '../questions';
import { canAccessWeek, canTakeExam, resolveEntitlement } from './policy';
import type { Entitlement, EntitlementRepository } from './types';

// 구독 권한 판정 + 게이팅 가드. 권위 있는 판정은 항상 여기(서버+DB)에서 한다.
// 비로그인(userId=null)은 free로 취급한다.
export class EntitlementService {
  constructor(private readonly repo: EntitlementRepository) {}

  async getEntitlement(userId: string): Promise<Entitlement> {
    return resolveEntitlement(await this.repo.getByUserId(userId));
  }

  private async planOf(userId: string | null): Promise<Entitlement['plan']> {
    if (!userId) return 'free';
    return (await this.getEntitlement(userId)).plan;
  }

  // 해당 주차 콘텐츠 접근 가드. 권한 없으면 403.
  async assertWeekAccess(userId: string | null, week: number): Promise<void> {
    if (!canAccessWeek(await this.planOf(userId), week)) {
      throw new AppError(403, 'plan_required', '이 콘텐츠는 Pro 플랜에서 이용할 수 있습니다.');
    }
  }

  // 문제 id 기준 접근 가드(퀴즈/복습). 없는 문제는 통과시키고 상위에서 404 처리.
  async assertQuestionAccess(userId: string | null, questionId: string): Promise<void> {
    const q = getQuestionById(questionId);
    if (!q) return;
    await this.assertWeekAccess(userId, q.week);
  }

  // 모의고사 접근 가드(Pro 전용).
  async assertExamAccess(userId: string | null): Promise<void> {
    if (!canTakeExam(await this.planOf(userId))) {
      throw new AppError(403, 'plan_required', '모의고사는 Pro 플랜 전용입니다.');
    }
  }

  grantPro(userId: string, until: Date | null = null): Promise<void> {
    return this.repo.grantPro(userId, until);
  }

  revoke(userId: string): Promise<void> {
    return this.repo.revoke(userId);
  }
}
