import { PgReviewRepository } from './reviewRepository';
import { ReviewService } from './reviewService';

// 저장소는 무상태라 싱글톤으로 재사용한다.
let repo: PgReviewRepository | null = null;

export function getReviewRepository(): PgReviewRepository {
  if (!repo) repo = new PgReviewRepository();
  return repo;
}

export function getReviewService(): ReviewService {
  return new ReviewService(getReviewRepository());
}
